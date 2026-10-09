/**
 * AcceptTripUseCase - Application Layer (Mobility Engine)
 *
 * A driver accepts a trip. Fully atomic + event-driven (P2-2):
 *   1. canonical `trip-state-machine` pre-validates SEARCHING -> ACCEPTED
 *      (fail-fast: misuse is rejected before any DB work),
 *   2. `TripRepository.updateTripStateAtomic` runs the whole accept inside
 *      one transaction (BEGIN → SELECT ... FOR UPDATE → conditional UPDATE →
 *      timeline → COMMIT); a state mismatch ROLLBACKs and throws a
 *      409 conflict (only one concurrent driver can win),
 *   3. the TripAccepted event (`DriverAccepted`) is published AFTER the
 *      atomic commit (never on failure), so Mobility holds no direct
 *      wallet/notification dependency.
 */

const TripStatus = require('../domain/enums/TripStatus');
const { transitionTo } = require('../domain/trip-state-machine');
const { TripNotFoundError, TripAlreadyAcceptedError, UnauthorizedDispatchError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

const DISPATCH_KEY_PREFIX = 'dispatch:trip:';
// (P13-2) نام رویداد ثبتشده در Outbox برای پذیرش سفر
const TRIP_ACCEPTED_EVENT = 'TripAccepted';

class AcceptTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {Object} [deps.redisClient] - کلاینت Redis (برای بررسی تخصیص)
     * @param {Function} [deps.emitEvent]
     */
    constructor({ tripRepository, redisClient = null, emitEvent = null, tripOfferRepository = null }) {
        this.tripRepository = tripRepository;
        this.redis = redisClient;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
        // (P13-2) پیشنهاد سفر + قفل توزیع‌شده (`TripOfferRepository` روی Redis)
        this.tripOfferRepository = tripOfferRepository;
    }

    async execute({ tripId, driverId, changedByUserId = null }) {
        // SECURITY: مسیر قدیمی نباید بدون آفر معتبر و قفل توزیع سفر را بپذیرد.
        // هر دو مسیر API از یک پیاده‌سازی واحد و اتمیک استفاده می‌کنند.
        return this.acceptOffer({ tripId, driverId, changedByUserId });
    }

    /**
     * (P13-2) پذیرش سفر در جریان توزیع (Offer + Distributed Lock):
     *   ۱) آفر فعالِ راننده بررسی می‌شود (منقضی/ناموجود → 403 Forbidden)
     *   ۲) قفل سفر با SETNX گرفته می‌شود؛ اگر در اختیار راننده دیگری باشد
     *      → 409 Conflict (فقط یک راننده می‌تواند سفر را بردارد)
     *   ۳) وضعیت سفر در PostgreSQL به ACCEPTED تغییر می‌کند و راننده به سفر
     *      متصل می‌شود — با تراکنش دیتابیس (BEGIN/SELECT FOR UPDATE/COMMIT)
     *   ۴) رویداد `TripAccepted` در جدول `outbox_events` در «همان تراکنش» ثبت می‌شود
     *   ۵) در صورت شکست مراحل ۳/۴ قفل آزاد می‌شود تا تلاش مجدد ممکن بماند
     *
     * @param {Object} input
     * @param {string} input.tripId
     * @param {string} input.driverId - از توکن احرازشده (نه از بدی درخواست)
     * @param {string} [input.changedByUserId]
     */
    async acceptOffer({ tripId, driverId, changedByUserId = null }) {
        if (!tripId || !driverId) {
            const error = new Error('پارامترهای tripId و driverId الزامی هستند.');
            error.code = 'ACCEPT_TRIP_VALIDATION';
            error.statusCode = 400;
            throw error;
        }
        if (!this.tripOfferRepository) {
            const error = new Error('AcceptTripUseCase.acceptOffer نیازمند tripOfferRepository است.');
            error.code = 'OFFER_REPOSITORY_MISSING';
            error.statusCode = 500;
            throw error;
        }

        // ۱) آفر باید موجود و منقضی‌نشده باشد (راننده واقعاً دعوت شده باشد)
        const offer = await this.tripOfferRepository.getOffer(tripId, driverId);
        if (!offer) {
            throw new UnauthorizedDispatchError(tripId, driverId);
        }

        // ۲) قفل توزیع‌شده: تنها یک راننده برنده می‌شود
        const locked = await this.tripOfferRepository.lockTrip(tripId, driverId);
        if (!locked) {
            throw new TripAlreadyAcceptedError(tripId);
        }

        let updated;
        try {
            // پیش‌اعتبارسنجی ماشین حالت کانونی (fail-fast، بدون دسترسی به DB)
            transitionTo(TripStatus.REQUESTED, TripStatus.ACCEPTED);

            // ۳+۴) تغییر وضعیت + اتصال راننده + ثبت رویداد Outbox در یک تراکنش
            updated = await this.tripRepository.updateTripStateAtomic({
                tripId,
                expectedState: TripStatus.REQUESTED,
                targetState: TripStatus.ACCEPTED,
                driverId,
                changedByUserId: changedByUserId || driverId,
                changedByRole: 'driver',
                reason: 'driver_accepted_offer',
                outboxEvent: {
                    aggregateId: String(tripId),
                    eventType: TRIP_ACCEPTED_EVENT,
                    payload: { tripId: String(tripId), driverId: String(driverId) },
                },
            });

            if (!updated) throw new TripNotFoundError(tripId);
        } catch (error) {
            // شکست تراکنش/Insert: آزادسازی قفل تا راننده (یا راننده بعدی) بتواند تلاش کند
            try {
                await this.tripOfferRepository.releaseLock(tripId);
            } catch (_) {
                // نادیده گرفتن — قفل با TTL خودش منقضی می‌شود
            }
            throw error;
        }

        // ۵) انتشار درون‌فرآیندی برای مصرفکننده‌های فعلی؛ انتشار پایدار و
        // تضمین‌شده (At-least-once) بر عهده OutboxRelay روی جدول outbox_events است.
        this.emitEvent(TripDomainEvents.DriverAccepted, {
            tripId,
            driverId,
            passengerId: updated.passenger_id,
        });

        return {
            tripId: updated.id,
            status: updated.status,
            driverId: updated.driver_id,
            passengerId: updated.passenger_id,
            offerStatus: offer.status,
            origin: { lat: updated.origin_lat, lng: updated.origin_lng },
            destination: { lat: updated.dest_lat, lng: updated.dest_lng },
        };
    }
}

module.exports = AcceptTripUseCase;

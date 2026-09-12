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
const { TripNotFoundError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

class AcceptTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {Function} [deps.emitEvent]
     */
    constructor({ tripRepository, emitEvent = null }) {
        this.tripRepository = tripRepository;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    }

    async execute({ tripId, driverId, changedByUserId = null }) {
        if (!tripId || !driverId) {
            const error = new Error('پارامترهای tripId و driverId الزامی هستند.');
            error.code = 'ACCEPT_TRIP_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        // ۱) پیش‌اعتبارسنجی ماشین حالت کانونی (fail-fast، بدون دسترسی به DB)
        // سفرها در CreateTripUseCase با REQUESTED ساخته می‌شوند؛ ماشین حالت
        // canonical این انتقال را (REQUESTED -> ACCEPTED) مجاز می‌داند (خط ۲۸ فلن).
        transitionTo(TripStatus.REQUESTED, TripStatus.ACCEPTED);

        // ۲) پذیرش اتمیک با قفل ردیفی (مالکیت تراکنش با ریپازیتوری است)
        const updated = await this.tripRepository.updateTripStateAtomic({
            tripId,
            expectedState: TripStatus.REQUESTED,
            targetState: TripStatus.ACCEPTED,
            driverId,
            changedByUserId: changedByUserId || driverId,
            changedByRole: 'driver',
            reason: 'driver_accepted',
        });

        if (!updated) {
            throw new TripNotFoundError(tripId);
        }

        // ۳) انتشار رویداد دامنه پس از Commit موفق (سرویس‌های دیگر مطلع می‌شوند)
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
            origin: { lat: updated.origin_lat, lng: updated.origin_lng },
            destination: { lat: updated.dest_lat, lng: updated.dest_lng },
        };
    }
}

module.exports = AcceptTripUseCase;

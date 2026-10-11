/**
 * EndTripUseCase - Application Layer (Mobility Engine)
 *
 * The trip finishes (IN_PROGRESS -> COMPLETED) and the final fare is
 * resolved. Runs inside a single DB transaction with row-level locking
 * (SELECT ... FOR UPDATE). After commit it emits `TripCompleted` carrying the
 * settlement payload { tripId, passengerId, driverId, amount, currency }
 * that the Wallet `TripCompleted` subscriber consumes to process the
 * passenger payment / driver revenue / platform commission.
 *
 * Fare resolution: use a validated server-authoritative final fare, or the
 * persisted estimate created from the pricing quote. Never invent a settlement
 * amount from straight-line distance when the authoritative fare is missing.
 */

const Trip = require('../domain/models/Trip');
const { TripNotFoundError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

/** Haversine distance in kilometres between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

class EndTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {Function} [deps.emitEvent]
     */
    constructor({ tripRepository, emitEvent = null }) {
        this.tripRepository = tripRepository;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    }

    execute({ tripId, changedByUserId = null, finalFare = null, driverId = null, actorRole = 'driver' }) {
        if (!tripId) {
            const error = new Error('پارامتر tripId الزامی است.');
            error.code = 'END_TRIP_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        return (async () => {
            const db = this.tripRepository.db;
            const client = await db.connect();
            let committed = false;
            try {
                await client.query('BEGIN');

                // الف) واکشی سفر با قفل ردیف (همزمانی ایمن)
                const row = await this.tripRepository.getTripByIdForUpdate(tripId, client);
                if (!row) {
                    throw new TripNotFoundError(tripId);
                }

                // SECURITY: فقط رانندهٔ تخصیص‌یافته یا مدیر ارشد مجاز به پایان سفر است.
                if (String(actorRole).toLowerCase() !== 'super_admin'
                    && (!driverId || String(row.driver_id) !== String(driverId))) {
                    const error = new Error('این سفر به رانندهٔ احرازشده تخصیص نیافته است.');
                    error.code = 'TRIP_FORBIDDEN';
                    error.statusCode = 403;
                    throw error;
                }

                // ب) گذار دامنه: IN_PROGRESS -> COMPLETED
                const trip = new Trip({ id: row.id, status: row.status });
                trip.complete(); // throws InvalidRideStateTransitionError on invalid

                // ج) تعیین کرایه نهایی
                const fare = this._resolveFare(finalFare, row);
                trip.finalCost = fare;

                // د) بهروزرسانی وضعیت + کرایه نهایی و ثبت timeline
                const updated = await this.tripRepository.updateTripStatus(
                    { tripId, status: trip.status, finalCost: fare },
                    client,
                );
                const actorId = changedByUserId || row.driver_id || row.passenger_id;
                await this.tripRepository.logStatusChange(
                    {
                        tripId,
                        oldStatus: row.status,
                        newStatus: trip.status,
                        changedByUserId: actorId,
                        changedByRole: 'driver',
                        reason: 'trip_completed',
                    },
                    client,
                );

                const currency = updated.currency_id || 'IRT';

                // ثبت پایدار رویداد در همان تراکنش سفر؛ اگر درج Outbox شکست بخورد،
                // تکمیل سفر هم rollback می‌شود تا وضعیت مالی از وضعیت سفر جدا نشود.
                if (this.tripRepository.outboxRepository) {
                    await this.tripRepository.outboxRepository.insert({
                        aggregateId: String(tripId),
                        eventType: TripDomainEvents.TripCompleted,
                        payload: {
                            tripId: String(tripId),
                            passengerId: updated.passenger_id,
                            driverId: updated.driver_id,
                            amount: fare,
                            currency,
                            ...(updated.promo_code ? { promoCode: updated.promo_code } : {}),
                        },
                    }, client);
                }

                await client.query('COMMIT');
                committed = true;
                // هـ) انتشار سریع رویداد پس از Commit. Outbox منبع پایدار است؛
                // شکست انتشار زنده نباید نتیجهٔ تراکنشِ commit‌شده را به خطا تبدیل کند.
                try {
                    await this.emitEvent(TripDomainEvents.TripCompleted, {
                        tripId,
                        passengerId: updated.passenger_id,
                        driverId: updated.driver_id,
                        amount: fare,
                        currency,
                        ...(updated.promo_code ? { promoCode: updated.promo_code } : {}),
                    });
                } catch (publishError) {
                    // OutboxRelay will retry durable delivery; don't report a false rollback.
                }

                return {
                    tripId: updated.id,
                    status: updated.status,
                    driverId: updated.driver_id,
                    passengerId: updated.passenger_id,
                    finalCost: fare,
                    amount: fare,
                    currency,
                };
            } catch (error) {
                if (!committed) {
                    try {
                        await client.query('ROLLBACK');
                    } catch (rollbackError) {
                        // Preserve the original failure; the connection is released below.
                    }
                }
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    /**
     * Resolve settlement amount only from a valid, server-authoritative fare.
     * Missing pricing data must stop settlement rather than silently charge a
     * guessed amount.
     */
    _resolveFare(finalFare, row) {
        if (finalFare != null) {
            const amount = Number(finalFare);
            if (Number.isFinite(amount) && amount > 0) return Math.round(amount);
            const error = new Error('مبلغ کرایهٔ نهایی معتبر نیست.');
            error.code = 'INVALID_FINAL_FARE';
            error.statusCode = 400;
            throw error;
        }

        const estimated = Number(row.estimated_cost);
        if (Number.isFinite(estimated) && estimated > 0) return Math.round(estimated);

        const error = new Error('قیمت معتبر برای تسویهٔ این سفر موجود نیست؛ ابتدا قیمت سفر را از سامانهٔ قیمت‌گذاری تأیید کنید.');
        error.code = 'FINAL_FARE_UNAVAILABLE';
        error.statusCode = 409;
        throw error;
    }
}

module.exports = EndTripUseCase;
module.exports.haversineKm = haversineKm;
/**
 * ArriveAtPickupUseCase - Application Layer (Mobility Engine)
 *
 * A driver confirms arrival at the pickup point (ACCEPTED -> ARRIVED).
 * Runs inside a single DB transaction with row-level locking
 * (SELECT ... FOR UPDATE). The domain Trip state machine enforces the
 * transition; the DRIVER_ARRIVED domain event is emitted after commit.
 *
 * This is the canonical completion of the "driver arrives at pickup" step
 * (P5-1); the older `DriverArrivedUseCase` is kept for backward-compatible
 * integration tests.
 */

const Trip = require('../domain/models/Trip');
const { TripNotFoundError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

class ArriveAtPickupUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {Function} [deps.emitEvent]
     */
    constructor({ tripRepository, emitEvent = null }) {
        this.tripRepository = tripRepository;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    }

    async execute({ tripId, changedByUserId = null, driverId = null, actorRole = 'driver' }) {
        if (!tripId) {
            const error = new Error('پارامتر tripId الزامی است.');
            error.code = 'ARRIVE_PICKUP_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

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

            // SECURITY: راننده فقط می‌تواند سفر تخصیص‌یافته به پروفایل خودش را تغییر دهد.
            if (String(actorRole).toLowerCase() !== 'super_admin'
                && (!driverId || String(row.driver_id) !== String(driverId))) {
                const error = new Error('این سفر به رانندهٔ احرازشده تخصیص نیافته است.');
                error.code = 'TRIP_FORBIDDEN';
                error.statusCode = 403;
                throw error;
            }

            // ب) گذار دامنه: ACCEPTED -> ARRIVED
            const trip = new Trip({ id: row.id, status: row.status });
            trip.driverArrived(); // throws InvalidRideStateTransitionError on invalid

            // ج) بهروزرسانی وضعیت و ثبت timeline
            const updated = await this.tripRepository.updateTripStatus(
                { tripId, status: trip.status },
                client,
            );
            const actorId = changedByUserId || row.driver_id || row.passenger_id;
            await this.tripRepository.logStatusChange(
                {
                    tripId,
                    oldStatus: row.status,
                    newStatus: trip.status,
                    changedByUserId: actorId,
                    changedByRole: String(actorRole || '').toLowerCase() === 'super_admin' ? 'super_admin' : 'driver',
                    reason: 'driver_arrived',
                },
                client,
            );

            // ثبت پایدار رویداد در همان تراکنش تغییر وضعیت؛ در صورت شکست درج، وضعیت هم rollback می‌شود.
            if (this.tripRepository.outboxRepository) {
                await this.tripRepository.outboxRepository.insert({
                    aggregateId: String(tripId),
                    eventType: TripDomainEvents.DriverArrived,
                    payload: {
                        tripId: String(tripId),
                        driverId: updated.driver_id,
                        passengerId: updated.passenger_id,
                    },
                }, client);
            }

            await client.query('COMMIT');
            committed = true;

            // انتشار زنده best-effort است؛ OutboxRelay انتشار پایدار را دوباره تلاش می‌کند.
            try {
                await this.emitEvent(TripDomainEvents.DriverArrived, {
                    tripId,
                    driverId: updated.driver_id,
                    passengerId: updated.passenger_id,
                });
            } catch (_) {
                // وضعیت سفر commit شده؛ خطای ناشر نباید پاسخ شکست کاذب ایجاد کند.
            }

            return {
                tripId: updated.id,
                status: updated.status,
                driverId: updated.driver_id,
                passengerId: updated.passenger_id,
            };
        } catch (error) {
            if (!committed) {
                try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
            }
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = ArriveAtPickupUseCase;
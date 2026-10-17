/**
 * DriverArrivedUseCase - Application Layer (Mobility Engine)
 *
 * A driver confirms arrival at the pickup point (ACCEPTED -> ARRIVED).
 * Runs inside a single DB transaction with row-level locking
 * (SELECT ... FOR UPDATE). The domain Trip state machine enforces the
 * transition; the DRIVER_ARRIVED domain event is emitted after commit.
 */

const Trip = require('../domain/models/Trip');
const { TripNotFoundError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

class DriverArrivedUseCase {
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
            error.code = 'ARRIVED_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        const db = this.tripRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // الف) واکشی سفر با قفل ردیف (همزمانی ایمن)
            const row = await this.tripRepository.getTripByIdForUpdate(tripId, client);
            if (!row) {
                throw new TripNotFoundError(tripId);
            }

            // امنیت: فقط رانندهٔ تخصیص‌یافته یا مدیر ارشد می‌تواند رسیدن را ثبت کند.
            // این بررسی زیر قفل ردیفی انجام می‌شود تا مالکیت از همان رکورد قفل‌شده خوانده شود.
            const normalizedActorRole = String(actorRole || '').toLowerCase();
            if (normalizedActorRole !== 'super_admin'
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

            await client.query('COMMIT');

            // د) انتشار رویداد دامنه پس از Commit
            this.emitEvent(TripDomainEvents.DriverArrived, { tripId, driverId: updated.driver_id });

            return {
                tripId: updated.id,
                status: updated.status,
                driverId: updated.driver_id,
                passengerId: updated.passenger_id,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = DriverArrivedUseCase;

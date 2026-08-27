/**
 * StartTripUseCase - Application Layer (Mobility Engine)
 *
 * The trip begins (ARRIVED -> IN_PROGRESS). Runs inside a single DB
 * transaction with row-level locking (SELECT ... FOR UPDATE). The domain
 * Trip state machine enforces the transition; the TRIP_STARTED domain event
 * is emitted after commit.
 */

const Trip = require('../domain/models/Trip');
const { TripNotFoundError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

class StartTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {Function} [deps.emitEvent]
     */
    constructor({ tripRepository, emitEvent = null }) {
        this.tripRepository = tripRepository;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    }

    async execute({ tripId, changedByUserId = null }) {
        if (!tripId) {
            const error = new Error('پارامتر tripId الزامی است.');
            error.code = 'START_TRIP_VALIDATION';
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

            // ب) گذار دامنه: ARRIVED -> IN_PROGRESS (started_at ثبت میشود)
            const trip = new Trip({ id: row.id, status: row.status });
            trip.startTrip(); // throws InvalidRideStateTransitionError on invalid

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
                    changedByRole: 'driver',
                    reason: 'trip_started',
                },
                client,
            );

            await client.query('COMMIT');

            // د) انتشار رویداد دامنه پس از Commit
            this.emitEvent(TripDomainEvents.TripStarted, {
                tripId,
                driverId: updated.driver_id,
                passengerId: updated.passenger_id,
                startedAt: new Date().toISOString(),
            });

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

module.exports = StartTripUseCase;

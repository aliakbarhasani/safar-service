/**
 * AcceptTripUseCase - Application Layer (Mobility Engine)
 *
 * A driver accepts a trip. Runs inside a single DB transaction with
 * concurrency control (SELECT ... FOR UPDATE) so that only one driver can
 * accept a given trip. The domain Trip state machine enforces the transition;
 * the ACCEPTED domain event is emitted after commit.
 */

const Trip = require('../domain/models/Trip');
const TripStatus = require('../domain/enums/TripStatus');
const { TripNotFoundError, TripAlreadyAcceptedError } = require('../domain/errors/RideErrors');
const { TripDomainEvents } = require('../domain/events/TripDomainEvents');

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

    async execute({ tripId, driverId }) {
        if (!tripId || !driverId) {
            const error = new Error('پارامترهای tripId و driverId الزامی هستند.');
            error.code = 'ACCEPT_TRIP_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        const db = this.tripRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // الف) واکشی سفر با قفل ردیف (همزمانیایمن)
            const row = await this.tripRepository.getTripByIdForUpdate(tripId, client);
            if (!row) {
                throw new TripNotFoundError(tripId);
            }

            // ب) اعتبارسنجی وضعیت — فقط SEARCHING قابل پذیرش است
            if (row.status !== TripStatus.SEARCHING) {
                throw new TripAlreadyAcceptedError(tripId); // 409
            }

            // ج) ساخت انتیتی و پذیرش (فراخوانی State Machine)
            const trip = new Trip({ id: row.id, status: row.status });
            trip.accept(driverId); // SEARCHING -> ACCEPTED (throws if invalid)

            // د) بهروزرسانی رکورد و ثبت timeline
            const updated = await this.tripRepository.updateTripStatus(
                { tripId, status: trip.status, driverId },
                client,
            );
            await this.tripRepository.logStatusChange(
                {
                    tripId,
                    oldStatus: row.status,
                    newStatus: trip.status,
                    changedByUserId: driverId,
                    changedByRole: 'driver',
                    reason: 'driver_accepted',
                },
                client,
            );

            await client.query('COMMIT');

            // هـ) انتشار رویداد دامنه پس از Commit
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
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = AcceptTripUseCase;
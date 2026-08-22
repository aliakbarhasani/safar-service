/**
 * DriverArrivedUseCase - Application Layer (Ride Engine)
 *
 * A driver confirms arrival at the pickup point (ACCEPTED -> ARRIVED).
 * Runs inside a single DB transaction with row-level locking
 * (SELECT ... FOR UPDATE) so the transition is concurrency-safe.
 * The domain Ride state machine enforces the transition; any invalid
 * transition is mapped to an InvalidRideStateError (HTTP 400).
 */

const Ride = require('../domain/models/Ride');
const RideStatus = require('../domain/enums/RideStatus');
const {
    RideNotFoundError,
    InvalidRideStateError,
    InvalidRideStateTransitionError,
} = require('../domain/errors/RideErrors');

class DriverArrivedUseCase {
    constructor({ rideRepository }) {
        this.rideRepository = rideRepository;
    }

    async execute({ rideId, changedByUserId = null }) {
        if (!rideId) {
            const error = new Error('پارامتر rideId الزامی است.');
            error.code = 'ARRIVED_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        const db = this.rideRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // الف) واکشی سفر با قفل ردیف (همزمانی ایمن)
            const row = await this.rideRepository.getRideByIdForUpdate(rideId, client);
            if (!row) {
                throw new RideNotFoundError(rideId);
            }

            // ب) ساخت انتیتی و فراخوانی State Machine (فقط ACCEPTED -> ARRIVED)
            const ride = new Ride({
                id: row.id,
                passengerId: row.passenger_id,
                driverId: row.driver_id,
                quoteId: row.quote_id,
                status: row.status,
                origin: { lat: row.origin_lat, lng: row.origin_lng },
                destination: { lat: row.dest_lat, lng: row.dest_lng },
            });

            try {
                ride.driverArrived();
            } catch (err) {
                if (err instanceof InvalidRideStateTransitionError) {
                    throw new InvalidRideStateError(ride.status, RideStatus.ACCEPTED);
                }
                throw err;
            }

            // ج) به‌روزرسانی وضعیت و ثبت لاگ
            const updated = await this.rideRepository.updateRideStatus(
                { rideId, status: ride.status, driverId: ride.driverId },
                client,
            );
            const actorId = changedByUserId || row.driver_id || row.passenger_id;
            await this.rideRepository.logStatusChange(
                { rideId, oldStatus: row.status, newStatus: ride.status, changedByUserId: actorId },
                client,
            );

            await client.query('COMMIT');

            return {
                rideId: updated.id,
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
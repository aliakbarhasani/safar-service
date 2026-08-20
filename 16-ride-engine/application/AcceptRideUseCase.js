/**
 * AcceptRideUseCase - Application Layer (Ride Engine)
 *
 * A driver accepts a ride. Runs inside a single DB transaction with
 * concurrency control (SELECT ... FOR UPDATE) so that only one driver can
 * accept a given ride. The domain Ride state machine enforces the transition.
 */

const Ride = require('../domain/models/Ride');
const RideStatus = require('../domain/enums/RideStatus');
const {
    RideNotFoundError,
    RideAlreadyAcceptedError,
} = require('../domain/errors/RideErrors');

class AcceptRideUseCase {
    constructor({ rideRepository }) {
        this.rideRepository = rideRepository;
    }

    async execute({ rideId, driverId }) {
        if (!rideId || !driverId) {
            const error = new Error('پارامترهای rideId و driverId الزامی هستند.');
            error.code = 'ACCEPT_RIDE_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        const db = this.rideRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // الف) واکشی سفر با قفل ردیف (همزمانی‌ایمن)
            const row = await this.rideRepository.getRideByIdForUpdate(rideId, client);
            if (!row) {
                throw new RideNotFoundError(rideId);
            }

            // ب) اعتبارسنجی وضعیت — فقط SEARCHING قابل پذیرش است
            if (row.status !== RideStatus.SEARCHING) {
                // اگر قبلاً ACCEPTED/بیشتر شد -> خطای	409
                if (row.status === RideStatus.ACCEPTED) {
                    throw new RideAlreadyAcceptedError(rideId);
                }
                throw new RideAlreadyAcceptedError(rideId);
            }

            // ج) ساخت انتیتی و پذیرش (فراخوانی State Machine)
            const ride = new Ride({
                id: row.id,
                passengerId: row.passenger_id,
                driverId: row.driver_id,
                quoteId: row.quote_id,
                status: row.status,
                origin: { lat: row.origin_lat, lng: row.origin_lng },
                destination: { lat: row.dest_lat, lng: row.dest_lng },
            });
            ride.accept(driverId); // SEARCHING -> ACCEPTED (throws if invalid)

            // د) به‌روزرسانی رکورد و ثبت لاگ
            const updated = await this.rideRepository.updateRideStatus(
                { rideId, status: ride.status, driverId },
                client,
            );
            await this.rideRepository.logStatusChange(
                { rideId, oldStatus: row.status, newStatus: ride.status, changedByUserId: driverId },
                client,
            );

            await client.query('COMMIT');

            return {
                rideId: updated.id,
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

module.exports = AcceptRideUseCase;
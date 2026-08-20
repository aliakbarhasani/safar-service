/**
 * CreateRideUseCase - Application Layer (Ride Engine)
 *
 * Orchestrates ride creation inside a single DB transaction:
 *   1) consumes the pricing quote (atomic, concurrency-safe),
 *   2) builds a new Ride domain entity,
 *   3) persists the ride row,
 *   4) logs the initial status transition (REQUESTED),
 *   5) commits; on any error the whole transaction is rolled back.
 */

const Ride = require('../domain/models/Ride');
const RideStatus = require('../domain/enums/RideStatus');

class CreateRideUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/RideRepository')} deps.rideRepository
     * @param {import('../../15-pricing-engine/infrastructure/PricingRepository')} deps.pricingRepository
     */
    constructor({ rideRepository, pricingRepository }) {
        this.rideRepository = rideRepository;
        this.pricingRepository = pricingRepository;
    }

    async execute(inputData) {
        const {
            passengerId,
            quoteId,
            originLat,
            originLng,
            destLat,
            destLng,
            referenceId = null,
        } = inputData;

        if (!passengerId || !quoteId) {
            const error = new Error('پارامترهای passengerId و quoteId الزامی هستند.');
            error.code = 'RIDE_VALIDATION_ERROR';
            error.statusCode = 400;
            throw error;
        }

        const db = this.rideRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // الف) مصرف Quote (با قفل همزمانی) در همان تراکنش جاری
            const rideReferenceId = referenceId || `ride:${quoteId}`;
            const consumed = await this.pricingRepository.consumeQuote(
                quoteId,
                rideReferenceId,
                client, // join the outer transaction
            );

            // ب) ساخت نمونه Ride
            const ride = new Ride({
                passengerId,
                quoteId,
                status: RideStatus.REQUESTED,
                origin: { lat: originLat, lng: originLng },
                destination: { lat: destLat, lng: destLng },
            });

            // ج) ذخیره سفر در جدول rides
            const rideRecord = ride.toDatabaseRecord();
            const savedRide = await this.rideRepository.createRide(rideRecord, client);

            // د) ثبت تغییر وضعیت اولیه -> REQUESTED
            await this.rideRepository.logStatusChange(
                {
                    rideId: savedRide.id,
                    oldStatus: null,
                    newStatus: ride.status,
                    changedByUserId: passengerId,
                },
                client,
            );

            await client.query('COMMIT');

            return {
                rideId: savedRide.id,
                status: savedRide.status,
                quoteId: savedRide.quote_id,
                quoteStatus: consumed.status,
                passengerId: savedRide.passenger_id,
                driverId: savedRide.driver_id,
                origin: { lat: savedRide.origin_lat, lng: savedRide.origin_lng },
                destination: { lat: savedRide.dest_lat, lng: savedRide.dest_lng },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = CreateRideUseCase;
/**
 * CreateTripUseCase - Application Layer (Mobility Engine)
 *
 * Orchestrates trip creation inside a single DB transaction:
 *   1) validates serviceType against the central ServiceTypes dictionary,
 *   2) consumes the pricing quote (atomic, concurrency-safe),
 *   3) builds the rich Trip domain entity,
 *   4) persists the trip row (`trips`) + initial timeline row (`trip_timeline`),
 *   5) emits TRIP_REQUESTED / DRIVER_SEARCH_STARTED domain events,
 *   6) commits; on any error the whole transaction is rolled back.
 */

const Trip = require('../domain/models/Trip');
const TripStatus = require('../domain/enums/TripStatus');
const { ALL_SERVICE_TYPES, isValidServiceType } = require('../../01-core-system/constants/ServiceTypes');
const { TripDomainEvents } = require('../domain/events/TripDomainEvents');

class CreateTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {import('../../15-pricing-engine/infrastructure/PricingRepository')} deps.pricingRepository
     * @param {Function} [deps.emitEvent] - optional domain-event subscriber
     */
    constructor({ tripRepository, pricingRepository, emitEvent = null }) {
        this.tripRepository = tripRepository;
        this.pricingRepository = pricingRepository;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    }

    async execute(inputData) {
        const {
            passengerId,
            quoteId,
            originLat,
            originLng,
            destLat,
            destLng,
            originAddress = null,
            destinationAddress = null,
            serviceType,
            paymentMethod = null,
            countryId = null,
            referenceId = null,
        } = inputData;

        if (!passengerId || !quoteId) {
            const error = new Error('پارامترهای passengerId و quoteId الزامی هستند.');
            error.code = 'TRIP_VALIDATION_ERROR';
            error.statusCode = 400;
            throw error;
        }
        // گام ۱۶: نوع سرویس الزامی و فقط از لغتنامهی مرکزی پذیرفته میشود
        // (هاردکد «taxi» حذف شده است).
        if (!serviceType || !isValidServiceType(serviceType)) {
            const error = new Error(
                `نوع سرویس نامعتبر است. مقادیر مجاز: ${ALL_SERVICE_TYPES.join(', ')}`,
            );
            error.code = 'TRIP_SERVICE_TYPE_INVALID';
            error.statusCode = 400;
            throw error;
        }

        const db = this.tripRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // الف) مصرف Quote (با قفل همزمانی) در همان تراکنش جاری
            const tripReferenceId = referenceId || `trip:${quoteId}`;
            const consumed = await this.pricingRepository.consumeQuote(
                quoteId,
                tripReferenceId,
                client, // join the outer transaction
            );

            // ب) ساخت انتیتی غنی Trip
            const trip = new Trip({
                passengerId,
                quoteId,
                status: TripStatus.REQUESTED,
                serviceType,
                origin: { lat: originLat, lng: originLng },
                destination: { lat: destLat, lng: destLng },
                originAddress,
                destinationAddress,
                paymentMethod,
                countryId,
            });

            // ج) ذخیره سفر در جدول trips
            const tripRecord = trip.toDatabaseRecord();
            const savedTrip = await this.tripRepository.createTrip(tripRecord, client);

            // د) ثبت تغییر وضعیت اولیه -> REQUESTED (trip_timeline)
            await this.tripRepository.logStatusChange(
                {
                    tripId: savedTrip.id,
                    oldStatus: null,
                    newStatus: trip.status,
                    changedByUserId: passengerId,
                    changedByRole: 'passenger',
                    reason: 'trip_requested',
                },
                client,
            );

            await client.query('COMMIT');

            // هـ) انتشار رویدادهای دامنه (پس از Commit — subscribe امن)
            this.emitEvent(TripDomainEvents.TripCreated, {
                tripId: savedTrip.id,
                passengerId,
                quoteId,
                serviceType,
            });
            this.emitEvent(TripDomainEvents.DriverSearchingStarted, {
                tripId: savedTrip.id,
                serviceType,
            });

            return {
                tripId: savedTrip.id,
                status: savedTrip.status,
                quoteId: savedTrip.quote_id,
                quoteStatus: consumed.status,
                serviceType: savedTrip.service_type,
                passengerId: savedTrip.passenger_id,
                driverId: savedTrip.driver_id,
                origin: { lat: savedTrip.origin_lat, lng: savedTrip.origin_lng },
                destination: { lat: savedTrip.dest_lat, lng: savedTrip.dest_lng },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = CreateTripUseCase;
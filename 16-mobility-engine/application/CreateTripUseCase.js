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
const TripDomainEvents = require('../domain/events/TripDomainEvents');

/** حداکثر اختلاف مجاز مختصات درخواست با Quote (متر) — P6-2 */
const QUOTE_COORD_TOLERANCE_METERS = 50;

function haversineMeters(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

class CreateTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {import('../../15-pricing-engine/infrastructure/PricingRepository')} deps.pricingRepository
     * @param {Function} [deps.emitEvent] - optional domain-event subscriber
     * @param {Object} [deps.fareQuoteStore] - (P6-2) Quote store ضد-دستکاری (18-pricing-service)
     */
    constructor({ tripRepository, pricingRepository, emitEvent = null, fareQuoteStore = null }) {
        this.tripRepository = tripRepository;
        this.pricingRepository = pricingRepository;
        this.fareQuoteStore = fareQuoteStore;
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

        // (P6-2) گارد Quote ضد-دستکاری: قیمت فقط از Quote سرور خوانده میشود.
        let quoteFare = null;
        if (this.fareQuoteStore) {
            const quote = await this.fareQuoteStore.get(quoteId);
            if (!quote) {
                const error = new Error('قیمت منقضی شده است، لطفاً دوباره تلاش کنید.');
                error.code = 'QUOTE_EXPIRED';
                error.statusCode = 410;
                throw error;
            }
            if (
                Number.isFinite(originLat) && Number.isFinite(originLng) &&
                Number.isFinite(destLat) && Number.isFinite(destLng) &&
                Number.isFinite(quote.originLat)
            ) {
                const oDelta = haversineMeters(originLat, originLng, quote.originLat, quote.originLng);
                const dDelta = haversineMeters(destLat, destLng, quote.destLat, quote.destLng);
                if (oDelta > QUOTE_COORD_TOLERANCE_METERS || dDelta > QUOTE_COORD_TOLERANCE_METERS) {
                    const error = new Error('مختصات درخواست با Quote همخوانی ندارد.');
                    error.code = 'INVALID_QUOTE';
                    error.statusCode = 400;
                    throw error;
                }
            }
            quoteFare = Number(quote.estimatedFare) || null;
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

            // ب) ساخت انتیتی غنی Trip — قیمت فقط از Quote سرور (P6-2)
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
                estimatedCost: quoteFare,
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
                // Temporary compatibility alias for callers that still consume
                // the pre-consolidation response contract.
                rideId: savedTrip.id,
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

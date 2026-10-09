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

function assertQuoteMatchesInput(quote, { originLat, originLng, destLat, destLng, serviceType }) {
    if (quote.serviceType && quote.serviceType !== serviceType) {
        const error = new Error('نوع سرویس با پیش‌فاکتور مطابقت ندارد.');
        error.code = 'INVALID_QUOTE';
        error.statusCode = 400;
        throw error;
    }

    const quoteCoordinates = [quote.originLat, quote.originLng, quote.destLat, quote.destLng].map(Number);
    if (quoteCoordinates.some((value) => !Number.isFinite(value))) {
        const error = new Error('پیش‌فاکتور فاقد مختصات معتبر است.');
        error.code = 'INVALID_QUOTE';
        error.statusCode = 400;
        throw error;
    }

    const originDelta = haversineMeters(originLat, originLng, quoteCoordinates[0], quoteCoordinates[1]);
    const destinationDelta = haversineMeters(destLat, destLng, quoteCoordinates[2], quoteCoordinates[3]);
    if (originDelta > QUOTE_COORD_TOLERANCE_METERS || destinationDelta > QUOTE_COORD_TOLERANCE_METERS) {
        const error = new Error('مختصات درخواست با Quote همخوانی ندارد.');
        error.code = 'INVALID_QUOTE';
        error.statusCode = 400;
        throw error;
    }
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

        const coordinates = [originLat, originLng, destLat, destLng].map(Number);
        if (coordinates.some((value) => !Number.isFinite(value))
            || coordinates[0] < -90 || coordinates[0] > 90
            || coordinates[2] < -90 || coordinates[2] > 90
            || coordinates[1] < -180 || coordinates[1] > 180
            || coordinates[3] < -180 || coordinates[3] > 180) {
            const error = new Error('مختصات مبدأ و مقصد معتبر نیستند.');
            error.code = 'TRIP_COORDINATES_INVALID';
            error.statusCode = 400;
            throw error;
        }

        // قیمت فقط از پیش‌فاکتور ذخیره‌شده در سرور خوانده می‌شود.
        let quoteFare = null;
        let fareQuote = null;
        if (this.fareQuoteStore) {
            fareQuote = await this.fareQuoteStore.get(quoteId);
            if (!fareQuote) {
                const error = new Error('قیمت منقضی شده است، لطفاً دوباره تلاش کنید.');
                error.code = 'QUOTE_EXPIRED';
                error.statusCode = 410;
                throw error;
            }
            assertQuoteMatchesInput(fareQuote, {
                originLat: coordinates[0], originLng: coordinates[1],
                destLat: coordinates[2], destLng: coordinates[3], serviceType,
            });
            quoteFare = Number(fareQuote.estimatedFare);
            if (!Number.isFinite(quoteFare) || quoteFare <= 0) {
                const error = new Error('مبلغ پیش‌فاکتور معتبر نیست.');
                error.code = 'INVALID_QUOTE';
                error.statusCode = 400;
                throw error;
            }
        }

        const db = this.tripRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // مصرف یک‌باره پیش‌فاکتور: Quote مختصات‌دار از Redis و Quote قدیمی از SQL.
            const tripReferenceId = referenceId || `trip:${quoteId}`;
            let quoteStatus = 'CONSUMED';
            if (this.fareQuoteStore) {
                if (typeof this.fareQuoteStore.consume !== 'function') {
                    const error = new Error('مصرف اتمیک پیش‌فاکتور در دسترس نیست.');
                    error.code = 'FARE_QUOTE_CONSUME_UNAVAILABLE';
                    error.statusCode = 503;
                    throw error;
                }
                // The matching SQL quote row is required by trips.quote_id FK and
                // is consumed in this same PostgreSQL transaction for audit integrity.
                const consumedSqlQuote = await this.pricingRepository.consumeQuote(quoteId, tripReferenceId, client);
                quoteStatus = consumedSqlQuote.status || 'CONSUMED';

                const consumedFareQuote = await this.fareQuoteStore.consume(quoteId);
                if (!consumedFareQuote) {
                    const error = new Error('قیمت منقضی شده است یا قبلاً استفاده شده است.');
                    error.code = 'QUOTE_EXPIRED';
                    error.statusCode = 410;
                    throw error;
                }
                assertQuoteMatchesInput(consumedFareQuote, {
                    originLat: coordinates[0], originLng: coordinates[1],
                    destLat: coordinates[2], destLng: coordinates[3], serviceType,
                });
                quoteFare = Number(consumedFareQuote.estimatedFare);
                if (!Number.isFinite(quoteFare) || quoteFare <= 0) {
                    const error = new Error('مبلغ پیش‌فاکتور معتبر نیست.');
                    error.code = 'INVALID_QUOTE';
                    error.statusCode = 400;
                    throw error;
                }
            } else {
                const consumed = await this.pricingRepository.consumeQuote(
                    quoteId,
                    tripReferenceId,
                    client,
                );
                quoteStatus = consumed.status || 'CONSUMED';
                quoteFare = Number(consumed.customer_final_amount);
                if (!Number.isFinite(quoteFare) || quoteFare <= 0) {
                    const error = new Error('مبلغ پیش‌فاکتور معتبر نیست.');
                    error.code = 'INVALID_QUOTE';
                    error.statusCode = 400;
                    throw error;
                }
            }

            // ب) ساخت انتیتی غنی Trip — قیمت فقط از Quote سرور (P6-2)
            const trip = new Trip({
                passengerId,
                quoteId,
                status: TripStatus.REQUESTED,
                serviceType,
                origin: { lat: coordinates[0], lng: coordinates[1] },
                destination: { lat: coordinates[2], lng: coordinates[3] },
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
                quoteStatus,
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

/**
 * CreateTripUseCase.quote-guard.test.js - Unit tests (P6-2)
 *
 * Verifies the anti-tamper Fare Quote guard on trip creation:
 *  - `quoteId` is mandatory (400 otherwise)
 *  - missing/expired quote  -> 410 QUOTE_EXPIRED («قیمت منقضی شده است…»)
 *  - coords deviating > 50m from the quote -> 400 INVALID_QUOTE
 *  - valid quote -> trip price (estimated_cost) is taken ONLY from the quote,
 *    transaction commits and domain events are emitted.
 */

const CreateTripUseCase = require('../application/CreateTripUseCase');

const PASSENGER_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_TYPE = 'urban_taxi';

const VALID_QUOTE = {
    quoteId: 'q-123',
    estimatedFare: 150000,
    distance: 12.5,
    surgeMultiplier: 1.5,
    geohash: 'tnkst',
    originLat: 35.6997,
    originLng: 51.3378,
    destLat: 35.6892,
    destLng: 51.389,
};

function buildDeps({ quote = VALID_QUOTE } = {}) {
    const client = {
        query: jest.fn(async (sql) => ({ rows: [], command: sql })),
        release: jest.fn(),
    };
    const tripRepository = {
        db: { connect: jest.fn(async () => client) },
        createTrip: jest.fn(async (record) => ({
            id: 'trip-1',
            status: record.status,
            quote_id: record.quote_id,
            service_type: record.service_type,
            passenger_id: record.passenger_id,
            driver_id: null,
            origin_lat: record.origin_lat,
            origin_lng: record.origin_lng,
            dest_lat: record.dest_lat,
            dest_lng: record.dest_lng,
        })),
        logStatusChange: jest.fn(async () => ({})),
    };
    const pricingRepository = {
        consumeQuote: jest.fn(async () => ({ status: 'CONSUMED', customer_final_amount: quote ? quote.estimatedFare : 150000 })),
    };
    const fareQuoteStore = {
        get: jest.fn(async (id) => (quote && quote.quoteId === id ? quote : quote)),
        consume: jest.fn(async (id) => (quote && quote.quoteId === id ? quote : null)),
    };
    const events = [];
    const emitEvent = (event, data) => events.push({ event, data });
    const useCase = new CreateTripUseCase({
        tripRepository,
        pricingRepository,
        fareQuoteStore,
        emitEvent,
    });
    return { useCase, tripRepository, pricingRepository, fareQuoteStore, events, client };
}

const BASE_INPUT = {
    passengerId: PASSENGER_ID,
    quoteId: 'q-123',
    originLat: VALID_QUOTE.originLat,
    originLng: VALID_QUOTE.originLng,
    destLat: VALID_QUOTE.destLat,
    destLng: VALID_QUOTE.destLng,
    serviceType: SERVICE_TYPE,
};

describe('CreateTripUseCase - Fare Quote guard (P6-2)', () => {
    test('rejects trip creation without quoteId (400)', async () => {
        const { useCase } = buildDeps();
        await expect(useCase.execute({ ...BASE_INPUT, quoteId: undefined })).rejects.toMatchObject({
            code: 'TRIP_VALIDATION_ERROR',
            statusCode: 400,
        });
    });

    test('throws 410 QUOTE_EXPIRED when quote is missing/expired in Redis', async () => {
        const { useCase, tripRepository, pricingRepository } = buildDeps({ quote: null });
        await expect(useCase.execute(BASE_INPUT)).rejects.toMatchObject({
            code: 'QUOTE_EXPIRED',
            statusCode: 410,
            message: 'قیمت منقضی شده است، لطفاً دوباره تلاش کنید.',
        });
        // سفر نباید ساخته شود و Quote مصرف هم نباید رخ دهد
        expect(tripRepository.createTrip).not.toHaveBeenCalled();
        expect(pricingRepository.consumeQuote).not.toHaveBeenCalled();
    });

    test('throws 400 INVALID_QUOTE when requested coords deviate > 50m from quote', async () => {
        const { useCase, tripRepository } = buildDeps();
        // ~0.001 deg lat ≈ 111 متر اختلاف -> بیش از تلورانس 50 متر
        await expect(
            useCase.execute({ ...BASE_INPUT, originLat: VALID_QUOTE.originLat + 0.001 }),
        ).rejects.toMatchObject({ code: 'INVALID_QUOTE', statusCode: 400 });
        expect(tripRepository.createTrip).not.toHaveBeenCalled();
    });

    test('accepts a valid quote and stores the price ONLY from the quote', async () => {
        const { useCase, tripRepository, events, client, fareQuoteStore } = buildDeps();
        const result = await useCase.execute(BASE_INPUT);

        expect(result.tripId).toBe('trip-1');
        expect(result.quoteId).toBe('q-123');

        // قیمت از Quote سرور خوانده شده، نه از ورودی کلاینت
        const record = tripRepository.createTrip.mock.calls[0][0];
        expect(record.estimated_cost).toBe(VALID_QUOTE.estimatedFare);
        expect(record.quote_id).toBe('q-123');

        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');

        const eventNames = events.map((e) => e.event);
        expect(eventNames).toContain('TripCreated');
        expect(fareQuoteStore.consume).not.toHaveBeenCalled();
    });

    test('client-supplied price is ignored (no trusted price input path)', async () => {
        const { useCase, tripRepository } = buildDeps();
        // کلاینت قیمت جعلی میفرستد؛ UseCase چنین فیلدی را اصلا نمیپذیرد
        await useCase.execute({ ...BASE_INPUT, estimatedFare: 1, finalFare: 1 });
        const record = tripRepository.createTrip.mock.calls[0][0];
        expect(record.estimated_cost).toBe(VALID_QUOTE.estimatedFare);
    });

    test('does not consume the Redis cache when SQL transaction rolls back', async () => {
        const { useCase, tripRepository, fareQuoteStore, client } = buildDeps();
        tripRepository.createTrip.mockRejectedValueOnce(new Error('simulated database failure'));

        await expect(useCase.execute(BASE_INPUT)).rejects.toThrow('simulated database failure');

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(fareQuoteStore.consume).not.toHaveBeenCalled();
    });

    test('rejects if cached fare differs from the authoritative SQL quote', async () => {
        const client = { query: jest.fn(async () => ({ rows: [] })), release: jest.fn() };
        const tripRepository = {
            db: { connect: jest.fn(async () => client) },
            createTrip: jest.fn(),
            logStatusChange: jest.fn(),
        };
        const pricingRepository = {
            consumeQuote: jest.fn(async () => ({ status: 'CONSUMED', customer_final_amount: 999 })),
        };
        const fareQuoteStore = {
            get: jest.fn(async () => VALID_QUOTE),
            consume: jest.fn(),
        };
        const useCase = new CreateTripUseCase({ tripRepository, pricingRepository, fareQuoteStore });

        await expect(useCase.execute(BASE_INPUT)).rejects.toMatchObject({
            code: 'INVALID_QUOTE',
            statusCode: 400,
        });
        expect(tripRepository.createTrip).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(fareQuoteStore.consume).not.toHaveBeenCalled();
    });

});
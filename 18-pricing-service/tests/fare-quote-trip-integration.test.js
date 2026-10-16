'use strict';

const { Pool } = require('pg');
const PricingRepository = require('../../15-pricing-engine/infrastructure/PricingRepository');
const TripRepository = require('../../16-mobility-engine/infrastructure/TripRepository');
const CreateTripUseCase = require('../../16-mobility-engine/application/CreateTripUseCase');
const { CalculateFareUseCase } = require('../application/CalculateFareUseCase');
const { FareQuoteStore } = require('../infrastructure/FareQuoteStore');

const ORIGIN = { lat: 35.6997, lng: 51.3378 };
const DESTINATION = { lat: 35.6892, lng: 51.389 };
const SERVICE_TYPE = 'urban_taxi';

function createMemoryRedis() {
  const values = new Map();
  return {
    status: 'ready',
    values,
    setex: jest.fn(async (key, _ttlSeconds, value) => values.set(key, value)),
    get: jest.fn(async (key) => values.get(key) || null),
    getdel: jest.fn(async (key) => {
      const value = values.get(key) || null;
      values.delete(key);
      return value;
    }),
  };
}

describe('Fare quote -> trip creation database integration', () => {
  let pool;
  let passengerId;
  let quoteId;
  let tripId;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PG_HOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || 5433),
      database: process.env.PG_DATABASE || 'safar_test_db',
      user: process.env.PG_USER || 'test_user',
      password: process.env.PG_PASSWORD || 'test_password',
      max: 3,
      connectionTimeoutMillis: 4000,
    });

    try {
      await pool.query('SELECT 1');
      const config = await pool.query(
        "SELECT id FROM pricing_configs WHERE service_type = $1 AND status = 'active' LIMIT 1",
        [SERVICE_TYPE],
      );
      if (config.rows.length === 0) {
        throw new Error('Required active urban_taxi pricing config is missing; run database migrations first.');
      }
      dbAvailable = true;
      const user = await pool.query(
        `INSERT INTO users (first_name, last_name, phone_number, password_hash, role)
         VALUES ($1, $2, $3, $4, 'passenger')
         RETURNING id`,
        ['Fare', 'Integration', `+9891${String(Date.now()).slice(-8)}`, 'test-only-password-hash'],
      );
      passengerId = user.rows[0].id;
    } catch (error) {
      if (process.env.REQUIRE_TEST_DATABASE === 'true') throw error;
      console.warn('[fare-quote-trip-integration] PostgreSQL unavailable; DB integration test skipped:', error.message);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool && dbAvailable) {
      try {
        if (tripId) {
          await pool.query('DELETE FROM trip_timeline WHERE trip_id = $1', [tripId]);
          await pool.query('DELETE FROM trips WHERE id = $1', [tripId]);
        }
        if (quoteId) {
          await pool.query('DELETE FROM pricing_audit_logs WHERE quote_id = $1', [quoteId]);
          await pool.query('DELETE FROM quotes WHERE id = $1', [quoteId]);
        }
        if (passengerId) await pool.query('DELETE FROM users WHERE id = $1', [passengerId]);
      } catch (error) {
        console.warn('[fare-quote-trip-integration] cleanup failed:', error.message);
      }
    }
    if (pool) await pool.end();
  });

  test('creates a server quote, consumes it once, and persists the trip plus timeline', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (test database unavailable outside required CI mode)');
    }

    const pricingRepository = new PricingRepository(pool);
    const redis = createMemoryRedis();
    const fareQuoteStore = new FareQuoteStore(redis);
    const demandSupplyTracker = {
      getSupplyAndDemand: jest.fn().mockResolvedValue({ ratio: 0 }),
    };
    const calculateFareUseCase = new CalculateFareUseCase({
      demandSupplyTracker,
      fareQuoteStore,
      pricingRepository,
    });
    const createTripUseCase = new CreateTripUseCase({
      tripRepository: new TripRepository(pool),
      pricingRepository,
      fareQuoteStore,
    });

    const quote = await calculateFareUseCase.execute({
      ...{ originLat: ORIGIN.lat, originLng: ORIGIN.lng, destLat: DESTINATION.lat, destLng: DESTINATION.lng },
      serviceType: SERVICE_TYPE,
    });
    quoteId = quote.quoteId;

    expect(quoteId).toBeTruthy();
    expect(quote.estimatedFare).toBeGreaterThan(0);
    expect(await fareQuoteStore.get(quoteId)).toMatchObject({
      quoteId,
      serviceType: SERVICE_TYPE,
      estimatedFare: quote.estimatedFare,
      originLat: ORIGIN.lat,
      originLng: ORIGIN.lng,
      destLat: DESTINATION.lat,
      destLng: DESTINATION.lng,
    });

    const trip = await createTripUseCase.execute({
      passengerId,
      quoteId,
      serviceType: SERVICE_TYPE,
      originLat: ORIGIN.lat,
      originLng: ORIGIN.lng,
      destLat: DESTINATION.lat,
      destLng: DESTINATION.lng,
      originAddress: 'Test origin',
      destinationAddress: 'Test destination',
    });
    tripId = trip.tripId;

    expect(trip).toMatchObject({ tripId, quoteId, status: 'REQUESTED', passengerId });

    const quoteRow = await pool.query(
      'SELECT status, final_amount, customer_final_amount, consumed_at FROM quotes WHERE id = $1',
      [quoteId],
    );
    expect(quoteRow.rows).toHaveLength(1);
    expect(quoteRow.rows[0].status).toBe('CONSUMED');
    expect(Number(quoteRow.rows[0].final_amount)).toBe(quote.estimatedFare);
    expect(Number(quoteRow.rows[0].customer_final_amount)).toBe(quote.estimatedFare);
    expect(quoteRow.rows[0].consumed_at).toBeTruthy();

    const tripRow = await pool.query(
      'SELECT passenger_id, quote_id, lifecycle_status, estimated_cost FROM trips WHERE id = $1',
      [tripId],
    );
    expect(tripRow.rows).toHaveLength(1);
    expect(tripRow.rows[0].passenger_id).toBe(passengerId);
    expect(tripRow.rows[0].quote_id).toBe(quoteId);
    expect(tripRow.rows[0].lifecycle_status).toBe('REQUESTED');
    expect(Number(tripRow.rows[0].estimated_cost)).toBe(quote.estimatedFare);

    const timeline = await pool.query(
      'SELECT previous_status, new_status, changed_by FROM trip_timeline WHERE trip_id = $1 ORDER BY created_at ASC LIMIT 1',
      [tripId],
    );
    expect(timeline.rows).toHaveLength(1);
    expect(timeline.rows[0].previous_status).toBeNull();
    expect(timeline.rows[0].new_status).toBe('REQUESTED');
    expect(timeline.rows[0].changed_by).toBe(passengerId);

    // SQL is authoritative for one-time consumption; a second create attempt
    // must fail and must not create a second trip from the same quote.
    await expect(createTripUseCase.execute({
      passengerId,
      quoteId,
      serviceType: SERVICE_TYPE,
      originLat: ORIGIN.lat,
      originLng: ORIGIN.lng,
      destLat: DESTINATION.lat,
      destLng: DESTINATION.lng,
      originAddress: 'Test origin',
      destinationAddress: 'Test destination',
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});

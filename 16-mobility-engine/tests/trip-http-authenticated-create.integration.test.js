'use strict';

const express = require('express');
const request = require('supertest');
const { Pool } = require('pg');
const PricingRepository = require('../../15-pricing-engine/infrastructure/PricingRepository');
const TripRepository = require('../infrastructure/TripRepository');
const CreateTripUseCase = require('../application/CreateTripUseCase');
const TripController = require('../presentation/TripController');
const createTripRouter = require('../presentation/TripRouter');
const { authorize } = require('../../02-api-gateway/middlewares/authorize.middleware');
const { authenticate } = require('../../13-auth-management/presentation/middleware/auth.middleware');
const JwtService = require('../../13-auth-management/domain/services/JwtService');
const SessionManager = require('../../13-auth-management/domain/services/SessionManager');
const SessionRepository = require('../../13-auth-management/infrastructure/repositories/SessionRepository');
const { CalculateFareUseCase } = require('../../18-pricing-service/application/CalculateFareUseCase');
const { FareQuoteStore } = require('../../18-pricing-service/infrastructure/FareQuoteStore');

const ORIGIN = { lat: 35.6997, lng: 51.3378 };
const DESTINATION = { lat: 35.6892, lng: 51.389 };
const SERVICE_TYPE = 'urban_taxi';

function createMemoryRedis() {
  const values = new Map();
  return {
    status: 'ready',
    values,
    setex: async (key, _ttl, value) => values.set(key, value),
    get: async (key) => values.get(key) || null,
    getdel: async (key) => {
      const value = values.get(key) || null;
      values.delete(key);
      return value;
    },
  };
}

describe('Authenticated trip creation HTTP integration', () => {
  let pool;
  let passengerId;
  let phoneNumber;
  let quoteId;
  let tripId;
  let sessionId;
  let sessionRepository;
  let dbAvailable = false;
  let app;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PG_HOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || 5433),
      database: process.env.PG_DATABASE || 'safar_test_db',
      user: process.env.PG_USER || 'test_user',
      password: process.env.PG_PASSWORD || 'test_password',
      max: 4,
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

      phoneNumber = `+9892${String(Date.now()).slice(-8)}`;
      const user = await pool.query(
        `INSERT INTO users (first_name, last_name, phone_number, password_hash, role)
         VALUES ($1, $2, $3, $4, 'passenger')
         RETURNING id`,
        ['HTTP', 'Integration', phoneNumber, 'test-only-password-hash'],
      );
      passengerId = user.rows[0].id;
      dbAvailable = true;
    } catch (error) {
      if (process.env.REQUIRE_TEST_DATABASE === 'true') throw error;
      console.warn('[trip-http-integration] PostgreSQL unavailable; test skipped:', error.message);
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
        if (sessionId) await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
        if (passengerId) await pool.query('DELETE FROM users WHERE id = $1', [passengerId]);
      } catch (error) {
        console.warn('[trip-http-integration] cleanup failed:', error.message);
      }
    }
    if (sessionRepository) sessionRepository.close();
    if (pool) await pool.end();
  });

  test('rejects anonymous requests, then creates one trip with a valid session and quote', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (test database unavailable outside required CI mode)');
    }

    const pricingRepository = new PricingRepository(pool);
    const redis = createMemoryRedis();
    const fareQuoteStore = new FareQuoteStore(redis);
    const calculateFareUseCase = new CalculateFareUseCase({
      demandSupplyTracker: { getSupplyAndDemand: async () => ({ ratio: 0 }) },
      fareQuoteStore,
      pricingRepository,
    });
    const createTripUseCase = new CreateTripUseCase({
      tripRepository: new TripRepository(pool),
      pricingRepository,
      fareQuoteStore,
    });

    const quote = await calculateFareUseCase.execute({
      originLat: ORIGIN.lat,
      originLng: ORIGIN.lng,
      destLat: DESTINATION.lat,
      destLng: DESTINATION.lng,
      serviceType: SERVICE_TYPE,
    });
    quoteId = quote.quoteId;

    sessionRepository = new SessionRepository();
    const sessionManager = new SessionManager({
      jwtService: new JwtService(),
      sessionRepository,
      userRepository: {},
    });
    const session = await sessionManager.createSession({
      id: passengerId,
      phoneNumber,
      role: 'passenger',
    });
    sessionId = session.sessionId;

    const controller = new TripController({ createTripUseCase });
    app = express();
    app.use(express.json());
    // Same authentication + permission middleware and TripRouter used by the Gateway.
    app.use('/api/v1/trips', authenticate, createTripRouter(controller, authorize));

    const tripPayload = {
      quoteId,
      serviceType: SERVICE_TYPE,
      originLat: ORIGIN.lat,
      originLng: ORIGIN.lng,
      destLat: DESTINATION.lat,
      destLng: DESTINATION.lng,
      originAddress: 'HTTP test origin',
      destinationAddress: 'HTTP test destination',
    };

    const anonymous = await request(app).post('/api/v1/trips').send(tripPayload);
    expect(anonymous.status).toBe(401);

    const beforeAuthenticatedCreate = await pool.query(
      'SELECT COUNT(*)::int AS count FROM trips WHERE quote_id = $1',
      [quoteId],
    );
    expect(beforeAuthenticatedCreate.rows[0].count).toBe(0);

    const created = await request(app)
      .post('/api/v1/trips')
      .set('Cookie', `access_token=${session.accessToken}`)
      .send(tripPayload);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      success: true,
      data: {
        quoteId,
        passengerId,
        status: 'REQUESTED',
      },
    });
    tripId = created.body.data.tripId;
    expect(tripId).toBeTruthy();

    const duplicate = await request(app)
      .post('/api/v1/trips')
      .set('Cookie', `access_token=${session.accessToken}`)
      .send(tripPayload);
    expect(duplicate.status).toBe(409);

    const rows = await pool.query('SELECT id FROM trips WHERE quote_id = $1', [quoteId]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(tripId);
  });
});

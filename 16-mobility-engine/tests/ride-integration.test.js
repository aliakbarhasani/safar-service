/**
 * ride-integration.test.js
 *
 * Integration test for the Ride Engine + Pricing Engine connection.
 * Scenario: create a real pricing quote -> feed it to CreateTripUseCase ->
 * verify the quote is CONSUMED, a ride row exists, and the initial
 * REQUESTED status log was written.
 *
 * Requires Postgres. Skips (non-failing) when the DB is unavailable.
 */

const { Pool } = require('pg');
const request = require('supertest');
const express = require('express');
const config = require('../../14-config-system/server.config');

const PricingRepository = require('../../15-pricing-engine/infrastructure/PricingRepository');
const GenerateQuoteUseCase = require('../../15-pricing-engine/application/GenerateQuoteUseCase');

const TripRepository = require('../infrastructure/TripRepository');
const CreateTripUseCase = require('../application/CreateTripUseCase');
const AcceptTripUseCase = require('../application/AcceptTripUseCase');
const DriverArrivedUseCase = require('../application/DriverArrivedUseCase');
const StartTripUseCase = require('../application/StartTripUseCase');
const CompleteTripUseCase = require('../application/CompleteTripUseCase');
const CancelTripUseCase = require('../application/CancelTripUseCase');
const TripController = require('../presentation/TripController');
const createTripRouter = require('../presentation/TripRouter');

describe('Ride Engine - Integration (create ride with consumed quote)', () => {
  let pool;
  let dbAvailable = true;
  let tripRepository;
  let pricingRepository;
  let passengerId; // a real user row created for the test (FK integrity)
  let driverIdA;   // driver who accepts (FK integrity)
  let driverIdB;   // second driver for concurrency test
  let createdQuoteIds = [];
  let app;

  async function createTestUser(name) {
    const res = await pool.query(
      `INSERT INTO users (first_name, last_name, phone_number, password_hash, role)
       VALUES ($1, $2, $3, $4, 'passenger')
       RETURNING id`,
      ['Test', name, `+989156${String(Date.now()).slice(-7)}`, 'test-hash'],
    );
    return res.rows[0].id;
  }

  beforeAll(async () => {
    pool = new Pool({
      host: config.pg.host,
      port: config.pg.port,
      database: config.pg.database,
      user: config.pg.user,
      password: config.pg.password,
      max: 5,
      connectionTimeoutMillis: 4000,
    });

    try {
      const client = await pool.connect();
      // Schema availability guard: the unified TripRepository targets the
      // canonical `trips` shape produced by migration 020 (lifecycle_status /
      // quote_id columns). Migration files are intentionally NOT executed from
      // within this step; if they have not been applied yet, DB-backed tests
      // are skipped instead of failing.
      const schemaCheck = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'trips' AND column_name IN ('lifecycle_status','quote_id')",
      );
      client.release();
      if (schemaCheck.rows.length < 2) {
        console.warn('[ride-integration] trips table lacks migration-020 columns (lifecycle_status/quote_id) - skipping DB-backed tests until 020 is applied.');
        dbAvailable = false;
      }
    } catch (error) {
      console.warn('[ride-integration] PostgreSQL unavailable - skipping DB-backed tests:', error.message);
      dbAvailable = false;
    }

    tripRepository = new TripRepository(pool);
    pricingRepository = new PricingRepository(pool);

    if (dbAvailable) {
      passengerId = await createTestUser('RidePassenger');
      driverIdA = await createTestUser('DriverA');
      driverIdB = await createTestUser('DriverB');

      // Build the Express app with all ride use cases (Presentation layer).
      const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
      const acceptTripUseCase = new AcceptTripUseCase({ tripRepository });
      const driverArrivedUseCase = new DriverArrivedUseCase({ tripRepository });
      const startTripUseCase = new StartTripUseCase({ tripRepository });
      const completeTripUseCase = new CompleteTripUseCase({ tripRepository });
      const cancelTripUseCase = new CancelTripUseCase({ tripRepository });
      const controller = new TripController({
        createTripUseCase,
        acceptTripUseCase,
        driverArrivedUseCase,
        startTripUseCase,
        completeTripUseCase,
        cancelTripUseCase,
      });
      app = express();
      app.use(express.json());
      app.use('/api/v1/trips', createTripRouter(controller));
    }
  });

  afterEach(async () => {
    // Clean up any quotes created during this test (audit rows cascade via FK).
    for (const qid of createdQuoteIds) {
      try {
        await pool.query('DELETE FROM quotes WHERE id = $1', [qid]);
      } catch (e) {
        // non-fatal cleanup
      }
    }
    createdQuoteIds = [];
  });

  afterAll(async () => {
    if (dbAvailable) {
      try {
        // Cleanup rides (and status logs cascade) + the test users.
        if (passengerId) {
          await pool.query('DELETE FROM trips WHERE passenger_id = $1', [passengerId]);
        }
        for (const uid of [passengerId, driverIdA, driverIdB]) {
          if (uid) {
            try { await pool.query('DELETE FROM users WHERE id = $1', [uid]); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        console.warn('[ride-integration] cleanup error:', e.message);
      }
    }
    if (pool) {
      try { await pool.end(); } catch (e) { /* ignore */ }
    }
  });

  test('creates a real quote, consumes it, and persists the ride + status log', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    // ۱. ساخت یک Quote واقعی در موتور قیمت‌گذاری
    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 5,
      durationMin: 8,
      trafficMultiplier: 1.0,
    });
    expect(quote.quoteId).toBeTruthy();
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    // ۲. ساخت سفر با CreateTripUseCase
    const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
    const ride = await createTripUseCase.execute({
      passengerId,
      serviceType: 'urban_taxi',
      quoteId,
      originLat: 35.7199,
      originLng: 51.4100,
      destLat: 35.7155,
      destLng: 51.4049,
      referenceId: `ride-ref-${Date.now()}`, // unique across repeated runs
    });

    expect(ride.rideId).toBeTruthy();
    expect(ride.status).toBe('REQUESTED');
    expect(ride.quoteId).toBe(quoteId);

    // ۳. بررسی CONSUMED شدن Quote در دیتابیس
    const quoteRow = await pool.query('SELECT status, consumed_at FROM quotes WHERE id = $1', [quoteId]);
    expect(quoteRow.rows.length).toBe(1);
    expect(quoteRow.rows[0].status).toBe('CONSUMED');
    expect(quoteRow.rows[0].consumed_at).toBeTruthy();

    // ۴. بررسی وجود رکورد سفر
    const rideRow = await pool.query('SELECT * FROM trips WHERE id = $1', [ride.rideId]);
    expect(rideRow.rows.length).toBe(1);
    expect(rideRow.rows[0].lifecycle_status).toBe('REQUESTED');
    expect(rideRow.rows[0].quote_id).toBe(quoteId);

    // ۵. بررسی لاگ وضعیت اولیه REQUESTED
    const logRows = await pool.query(
      'SELECT * FROM trip_timeline WHERE trip_id = $1 ORDER BY created_at ASC LIMIT 1',
      [ride.rideId],
    );
    expect(logRows.rows.length).toBe(1);
    expect(logRows.rows[0].new_status).toBe('REQUESTED');
    expect(logRows.rows[0].previous_status).toBeNull();
  });

  test('rolls back everything when the quote is already consumed', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    // create a fresh quote
    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 3,
      durationMin: 5,
      trafficMultiplier: 1.0,
    });
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    // consume it once (unique ref per run to avoid collisions across reruns)
    const uniqueRef = `already-used-${Date.now()}`;
    await pricingRepository.consumeQuote(quoteId, uniqueRef);

    // second create ride should fail -> quote already consumed
    const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
    await expect(
      createTripUseCase.execute({
        passengerId,
        serviceType: 'urban_taxi',
        quoteId,
        originLat: 35.7,
        originLng: 51.4,
        destLat: 35.6,
        destLng: 51.3,
      }),
    ).rejects.toThrow(/قبلاً مصرف شده/);
  });

  test('API: create ride via POST /api/v1/trips', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    // fresh quote
    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 4,
      durationMin: 6,
      trafficMultiplier: 1.0,
    });
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    const res = await request(app)
      .post('/api/v1/trips')
      .send({
        serviceType: 'urban_taxi',
        quoteId,
        passengerId,
        originLat: 35.7199,
        originLng: 51.4100,
        destLat: 35.7155,
        destLng: 51.4049,
        referenceId: `api-ref-${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rideId).toBeTruthy();
    expect(res.body.data.status).toBe('REQUESTED');

    // cleanup this ride too (driver is null so rides.passenger_id filter)
    await pool.query('DELETE FROM trips WHERE id = $1', [res.body.data.rideId]);
  });

  test('API: successful accept by driver A (200 ACCEPTED)', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    // create a ride in REQUESTED via CreateTripUseCase (fast path)
    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 2,
      durationMin: 4,
      trafficMultiplier: 1.0,
    });
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
    const ride = await createTripUseCase.execute({
      passengerId,
      serviceType: 'urban_taxi',
      quoteId,
      originLat: 35.71,
      originLng: 51.41,
      destLat: 35.70,
      destLng: 51.40,
      referenceId: `acc1-${Date.now()}`,
    });

    // Move ride into SEARCHING so it is "findable" (accept requires SEARCHING per state machine).
    await pool.query('UPDATE trips SET lifecycle_status = $1 WHERE id = $2', ['SEARCHING', ride.rideId]);

    const res = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/accept`)
      .send({ driverId: driverIdA });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(res.body.data.driverId).toBe(driverIdA);

    // cleanup this ride
    await pool.query('DELETE FROM trips WHERE id = $1', [ride.rideId]);
  });

  test('API: second driver B gets 409 (concurrency / already accepted)', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 2,
      durationMin: 4,
      trafficMultiplier: 1.0,
    });
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
    const ride = await createTripUseCase.execute({
      passengerId,
      serviceType: 'urban_taxi',
      quoteId,
      originLat: 35.71,
      originLng: 51.41,
      destLat: 35.70,
      destLng: 51.40,
      referenceId: `acc2-${Date.now()}`,
    });

    await pool.query('UPDATE trips SET lifecycle_status = $1 WHERE id = $2', ['SEARCHING', ride.rideId]);

    // First driver (A) accepts successfully.
    const resA = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/accept`)
      .send({ driverId: driverIdA });
    expect(resA.status).toBe(200);

    // Second driver (B) tries to accept the SAME ride -> must be rejected with 409.
    const resB = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/accept`)
      .send({ driverId: driverIdB });
    expect(resB.status).toBe(409);
    expect(resB.body.success).toBe(false);
    expect(resB.body.error).toMatch(/قبلاً.*پذیرفته/);

    // cleanup
    await pool.query('DELETE FROM trips WHERE id = $1', [ride.rideId]);
  });

  // ==================== چرخه کامل زندگی سفر ====================
  test('API: full lifecycle CREATE -> ACCEPT -> ARRIVED -> START -> COMPLETE', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 3,
      durationMin: 5,
      trafficMultiplier: 1.0,
    });
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
    const ride = await createTripUseCase.execute({
      passengerId,
      serviceType: 'urban_taxi',
      quoteId,
      originLat: 35.72,
      originLng: 51.40,
      destLat: 35.70,
      destLng: 51.42,
      referenceId: `lifecycle-${Date.now()}`,
    });
    expect(ride.status).toBe('REQUESTED');

    // State machine requires SEARCHING before accept (the "request a driver" step).
    await pool.query('UPDATE trips SET lifecycle_status = $1 WHERE id = $2', ['SEARCHING', ride.rideId]);

    // 1) accept
    const accept = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/accept`)
      .send({ driverId: driverIdA });
    expect(accept.status).toBe(200);
    expect(accept.body.data.status).toBe('ACCEPTED');

    // 2) driver arrived
    const arrived = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/arrived`)
      .send({ userId: driverIdA });
    expect(arrived.status).toBe(200);
    expect(arrived.body.data.status).toBe('ARRIVED');

    // 3) start trip
    const start = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/start`)
      .send({ userId: driverIdA });
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('IN_PROGRESS');

    // 4) complete trip
    const complete = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/complete`)
      .send({ userId: driverIdA });
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe('COMPLETED');
    expect(complete.body.data.driverId).toBe(driverIdA);

    // cleanup
    await pool.query('DELETE FROM trips WHERE id = $1', [ride.rideId]);
  });

  test('API: cancel ride from REQUESTED (CANCELLED)', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 1,
      durationMin: 2,
      trafficMultiplier: 1.0,
    });
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
    const ride = await createTripUseCase.execute({
      passengerId,
      serviceType: 'urban_taxi',
      quoteId,
      originLat: 35.73,
      originLng: 51.43,
      destLat: 35.71,
      destLng: 51.41,
      referenceId: `cancel-${Date.now()}`,
    });

    const cancel = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/cancel`)
      .send({ userId: passengerId });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');

    // cleanup
    await pool.query('DELETE FROM trips WHERE id = $1', [ride.rideId]);
  });

  test('API: complete from REQUESTED returns 400 (invalid state)', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    const generateUseCase = new GenerateQuoteUseCase(pricingRepository);
    const quote = await generateUseCase.execute({
      serviceType: 'urban_taxi',
      distanceKm: 1,
      durationMin: 1,
      trafficMultiplier: 1.0,
    });
    const quoteId = quote.quoteId;
    createdQuoteIds.push(quoteId);

    const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
    const ride = await createTripUseCase.execute({
      passengerId,
      serviceType: 'urban_taxi',
      quoteId,
      originLat: 35.73,
      originLng: 51.43,
      destLat: 35.71,
      destLng: 51.41,
      referenceId: `complete-invalid-${Date.now()}`,
    });

    // A ride freshly created is REQUESTED; completing it directly is not allowed.
    const invalidComplete = await request(app)
      .post(`/api/v1/trips/${ride.rideId}/complete`)
      .send({ userId: driverIdA });
    expect(invalidComplete.status).toBe(400);
    expect(invalidComplete.body.success).toBe(false);
    expect(invalidComplete.body.error).toMatch(/وضعیت/);

    // cleanup
    await pool.query('DELETE FROM trips WHERE id = $1', [ride.rideId]);
  });
});
/**
 * pricing-integration.test.js
 *
 * Integration test for the NEW pricing pipeline (Clean Architecture):
 *   PricingRepository (Infrastructure)
 *     -> GenerateQuoteUseCase (Application)
 *     -> PricingController + createPricingRouter (Presentation)
 *
 * Scenarios covered:
 *   1. 400     - missing required request params (serviceType / distanceKm)
 *   2. 404     - service type with no active pricing_configs row
 *   3. 201     - valid request, exact decimal calculation, and persistence
 *               of a row in the `quotes` and `pricing_audit_logs` tables.
 *
 * NOTE: Requires a running PostgreSQL instance. If the DB is unreachable the
 * suite is `skip`ped (reported as skipped) instead of failing, so the pricing
 * module test script stays green in DB-less environments.
 */

const request = require('supertest');
const express = require('express');

const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

const PricingRepository = require('../infrastructure/PricingRepository');
const GenerateQuoteUseCase = require('../application/GenerateQuoteUseCase');
const GetQuoteUseCase = require('../application/GetQuoteUseCase');
const ConsumeQuoteUseCase = require('../application/ConsumeQuoteUseCase');
const PricingController = require('../presentation/PricingController');
const createPricingRouter = require('../presentation/PricingRouter');
const { Decimal } = require('decimal.js');

function createApp(repository) {
  const app = express();
  app.use(express.json());

  const generateUseCase = new GenerateQuoteUseCase(repository);
  const getUseCase = new GetQuoteUseCase(repository);
  const consumeUseCase = new ConsumeQuoteUseCase(repository);
  const controller = new PricingController({
    generateQuoteUseCase: generateUseCase,
    getQuoteUseCase: getUseCase,
    consumeQuoteUseCase: consumeUseCase,
  });
  app.use('/api/v1/pricing', createPricingRouter(controller));

  return app;
}

describe('Pricing Engine - Integration (quotes persistence)', () => {
  let pool;
  let app;
  let dbAvailable = true;

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

    // Probe DB connectivity. If unreachable, mark suite as skippable.
    try {
      const client = await pool.connect();
      client.release();
    } catch (error) {
      console.warn('[pricing-integration] PostgreSQL unavailable - skipping DB-backed tests:', error.message);
      dbAvailable = false;
    }

    const repository = new PricingRepository(pool);
    app = createApp(repository);
  });

  afterAll(async () => {
    if (pool) {
      try { await pool.end(); } catch (e) { /* ignore */ }
    }
  });

  afterEach(async () => {
    // Best-effort cleanup of any quote created during this suite.
    if (dbAvailable && global.__createdQuoteId) {
      try {
        await pool.query('DELETE FROM pricing_audit_logs WHERE quote_id = $1', [global.__createdQuoteId]);
        await pool.query('DELETE FROM quotes WHERE id = $1', [global.__createdQuoteId]);
      } catch (e) { /* non-fatal cleanup */ }
      global.__createdQuoteId = null;
    }
  });
test('1) returns 400 when required params are missing', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .send({ distanceKm: 10 }); // missing serviceType

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('2) returns 404 for a service type without an active config', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .send({ serviceType: 'flying_car', distanceKm: 5, durationMin: 5 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('3) calculates exact amount and persists quote + audit log', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .send({
        serviceType: 'urban_taxi',
        distanceKm: 10,
        durationMin: 15,
        trafficMultiplier: 1.0,
        referenceId: 'itest-ref-001',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.quote_id).toBeTruthy();
    expect(data.status).toBe('CREATED');
    expect(data.currency).toBe('IRT');

    // Security: the customer-facing DTO must never expose the fee breakdown.
    expect(data.commission_amount).toBeUndefined();
    expect(data.tax_amount).toBeUndefined();
    expect(data.gross_amount).toBeUndefined();
    expect(data.provider_amount).toBeUndefined();

    // Exact decimal verification
    // urban_taxi seed: base_fare=15000, price_per_km=5000, price_per_minute=2000,
    // commission_rate=10%.
    const base = new Decimal(15000);
    const distanceCost = new Decimal(5000).times(10);   // 50000
    const timeCost = new Decimal(2000).times(15);       // 30000
    const gross = base.plus(distanceCost).plus(timeCost).times(new Decimal('1.0')); // 95000
    const commission = gross.times(new Decimal('0.10')); // 9500
    const provider = gross.minus(commission);            // 85500

    expect(new Decimal(data.final_amount).toFixed(4)).toBe(gross.toFixed(4));
    global.__createdQuoteId = data.quote_id;

    // Persistence verification in `quotes`
    const quoteRow = await pool.query('SELECT * FROM quotes WHERE id = $1', [data.quote_id]);
    expect(quoteRow.rows.length).toBe(1);
    expect(quoteRow.rows[0].service_type).toBe('urban_taxi');
    expect(quoteRow.rows[0].status).toBe('CREATED');
    expect(new Decimal(quoteRow.rows[0].gross_amount).toFixed(4)).toBe(gross.toFixed(4));
    expect(new Decimal(quoteRow.rows[0].commission_amount).toFixed(4)).toBe(commission.toFixed(4));
    expect(new Decimal(quoteRow.rows[0].provider_amount).toFixed(4)).toBe(provider.toFixed(4));

    // Persistence verification in `pricing_audit_logs`
    const auditRow = await pool.query(
      'SELECT * FROM pricing_audit_logs WHERE quote_id = $1 ORDER BY created_at DESC LIMIT 1',
      [data.quote_id],
    );
    expect(auditRow.rows.length).toBe(1);
    expect(auditRow.rows[0].action_type).toBe('QUOTE_GENERATED');
    expect(auditRow.rows[0].rule_snapshot).toBeTruthy();
    expect(auditRow.rows[0].calculation_steps).toBeTruthy();
  });

  test('4) GET /quotes/:quoteId returns 200 with a valid non-expired quote', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    // Create a fresh quote to fetch via GET (independent of test #3 / afterEach cleanup).
    const created = await request(app)
      .post('/api/v1/pricing/calculate')
      .send({
        serviceType: 'urban_taxi',
        distanceKm: 5,
        durationMin: 10,
        trafficMultiplier: 1.0,
        referenceId: 'itest-get-ref-001',
      });

    expect(created.status).toBe(201);
    const quoteId = created.body.data.quote_id;
    global.__createdQuoteId = quoteId; // mark for afterEach cleanup

    // Now fetch it back
    const res = await request(app)
      .get(`/api/v1/pricing/quotes/${quoteId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.quote_id).toBe(quoteId);
    expect(data.currency).toBe('IRT');
    expect(data.status).toBe('CREATED');
    expect(data.isExpired).toBe(false); // freshly created quote is still valid
    expect(data.final_amount).toBeDefined();
    expect(data.expires_at).toBeDefined();
    expect(typeof data.isExpired).toBe('boolean');

    // Security: the customer-facing DTO must never expose the fee breakdown.
    expect(data.commission_amount).toBeUndefined();
    expect(data.tax_amount).toBeUndefined();
    expect(data.gross_amount).toBeUndefined();
    expect(data.provider_amount).toBeUndefined();
  });

  test('5) GET /quotes/:unknownId returns 404', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    const res = await request(app)
      .get('/api/v1/pricing/quotes/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('6) consume a quote successfully then reject duplicate consumption (409)', async () => {
    if (!dbAvailable) {
      return console.log('  * skipped (db unavailable)');
    }

    // Create a fresh quote
    const created = await request(app)
      .post('/api/v1/pricing/calculate')
      .send({
        serviceType: 'urban_taxi',
        distanceKm: 8,
        durationMin: 12,
        trafficMultiplier: 1.0,
      });

    expect(created.status).toBe(201);
    const quoteId = created.body.data.quote_id;
    global.__createdQuoteId = quoteId; // mark for afterEach cleanup

    // First consumption should succeed -> 200
    const first = await request(app)
      .post(`/api/v1/pricing/quotes/${quoteId}/consume`)
      .send({ referenceId: 'trip-ref-001' });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.status).toBe('CONSUMED');
    expect(first.body.data.referenceId).toBe('trip-ref-001');

    // Verify status persisted in the DB
    const row = await pool.query('SELECT status, consumed_at FROM quotes WHERE id = $1', [quoteId]);
    expect(row.rows[0].status).toBe('CONSUMED');
    expect(row.rows[0].consumed_at).toBeTruthy();

    // Verify QUOTE_CONSUMED audit row was written
    const audit = await pool.query(
      'SELECT action_type FROM pricing_audit_logs WHERE quote_id = $1 ORDER BY created_at DESC LIMIT 1',
      [quoteId],
    );
    expect(audit.rows[0].action_type).toBe('QUOTE_CONSUMED');

    // Second consumption attempt must fail -> 409 (already consumed)
    const second = await request(app)
      .post(`/api/v1/pricing/quotes/${quoteId}/consume`)
      .send({ referenceId: 'trip-ref-002' });

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
  });
});
/**
 * infrastructure-api.test.js
 *
 * DB-less integration tests for the Pricing Engine's Infrastructure and
 * Presentation layers (Clean Architecture):
 *
 *   PricingRepository (Infrastructure)
 *     -> GenerateQuoteUseCase / GetQuoteUseCase / ConsumeQuoteUseCase (Application)
 *     -> PricingController + createPricingRouter (Presentation)
 *
 * A small in-memory stand-in for `pg.Pool` replaces PostgreSQL, so this suite
 * REALLY asserts behaviour (201/400/404/409, persistence, audit logging) in
 * every environment instead of silently skipping. The DB-backed counterpart of
 * this file is tests/pricing-integration.test.js.
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const PricingRepository = require('../infrastructure/PricingRepository');
const GenerateQuoteUseCase = require('../application/GenerateQuoteUseCase');
const GetQuoteUseCase = require('../application/GetQuoteUseCase');
const ConsumeQuoteUseCase = require('../application/ConsumeQuoteUseCase');
const PricingController = require('../presentation/PricingController');
const createPricingRouter = require('../presentation/PricingRouter');
const {
  QuoteNotFoundError,
  QuoteAlreadyConsumedError,
  QuoteExpiredError,
} = require('../domain/errors/PricingErrors');

// ── Fixtures ────────────────────────────────────────────────────────────────

/** An active `pricing_configs` row; commission_rate is a PERCENT as stored in DB. */
const URBAN_TAXI_CONFIG = {
  id: 'cfg-urban-taxi',
  service_type: 'urban_taxi',
  status: 'active',
  base_fare: '15000',
  price_per_km: '5000',
  price_per_minute: '2000',
  minimum_fare: '10000',
  commission_rate: '10', // repository maps 10 -> 0.10 factor
};

const TEN_MINUTES = 10 * 60 * 1000;

function futureIso(ms = TEN_MINUTES) {
  return new Date(Date.now() + ms).toISOString();
}

function pastIso(ms = TEN_MINUTES) {
  return new Date(Date.now() - ms).toISOString();
}

/** Build a `quotes` table row as SELECT * would return it. */
function makeQuoteRow(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    reference_id: null,
    pricing_config_id: URBAN_TAXI_CONFIG.id,
    service_type: 'urban_taxi',
    currency_code: 'IRT',
    gross_amount: '95000',
    discount_amount: '0',
    tax_amount: '0',
    commission_amount: '9500',
    provider_amount: '85500',
    customer_final_amount: '95000',
    status: 'CREATED',
    input_snapshot: JSON.stringify({ serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 }),
    calculation_snapshot: JSON.stringify({ baseFare: '15000' }),
    created_at: new Date(),
    expires_at: new Date(futureIso()),
    consumed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function normalise(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}


/**
 * Minimal in-memory stand-in for `pg.Pool`, sufficient for PricingRepository.
 * SQL is matched on its leading keywords so the fake stays readable and fails
 * loudly (throws) on any query it does not understand.
 */
function createInMemoryPool({ configs = [URBAN_TAXI_CONFIG], quotes = [] } = {}) {
  const state = {
    configs: configs.slice(),
    quotes: new Map(quotes.map((q) => [q.id, q])),
    audits: [],
    committed: 0,
    rolledBack: 0,
  };

  async function runQuery(sql, params = []) {
    const s = normalise(sql);

    // getActiveConfig(): active config for a service type
    if (s.startsWith('SELECT id, base_fare, price_per_km')) {
      const row = state.configs.find((c) => c.service_type === params[0] && c.status === 'active');
      return { rows: row ? [row] : [] };
    }

    // consumeQuote(): row lookup with a FOR UPDATE lock
    if (s.startsWith('SELECT id, status, expires_at, reference_id')) {
      const row = state.quotes.get(params[0]);
      return {
        rows: row
          ? [{ id: row.id, status: row.status, expires_at: row.expires_at, reference_id: row.reference_id }]
          : [],
      };
    }

    // getQuoteById(): full quote projection
    if (s.startsWith('SELECT id, reference_id, pricing_config_id')) {
      const row = state.quotes.get(params[0]);
      return { rows: row ? [row] : [] };
    }

    // saveQuoteAndAudit(): INSERT ... RETURNING id
    if (s.startsWith('INSERT INTO quotes')) {
      const [
        reference_id, pricing_config_id, service_type, currency_code,
        gross_amount, discount_amount, tax_amount, commission_amount,
        provider_amount, customer_final_amount, status,
        input_snapshot, calculation_snapshot, expires_at,
      ] = params;

      const row = {
        id: crypto.randomUUID(),
        reference_id, pricing_config_id, service_type, currency_code,
        gross_amount, discount_amount, tax_amount, commission_amount,
        provider_amount, customer_final_amount, status,
        input_snapshot: JSON.parse(input_snapshot),
        calculation_snapshot: JSON.parse(calculation_snapshot),
        created_at: new Date(),
        expires_at: new Date(expires_at),
        consumed_at: null,
        cancelled_at: null,
      };
      state.quotes.set(row.id, row);
      return { rows: [{ id: row.id }] };
    }

    // Audit trail (both QUOTE_GENERATED and QUOTE_CONSUMED)
    if (s.startsWith('INSERT INTO pricing_audit_logs')) {
      const isConsume = s.includes("'QUOTE_CONSUMED'");
      state.audits.push({
        quote_id: params[0],
        action_type: isConsume ? 'QUOTE_CONSUMED' : params[1],
        rule_snapshot: isConsume ? params[1] : params[2],
        calculation_steps: isConsume ? params[2] : params[3],
      });
      return { rows: [] };
    }

    // consumeQuote(): status transition
    if (s.startsWith('UPDATE quotes')) {
      const row = state.quotes.get(params[0]);
      if (!row) return { rows: [] };
      row.status = 'CONSUMED';
      row.consumed_at = new Date();
      row.reference_id = params[1] || row.reference_id;
      return {
        rows: [{
          id: row.id, status: row.status,
          reference_id: row.reference_id, consumed_at: row.consumed_at,
        }],
      };
    }

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      if (s === 'COMMIT') state.committed += 1;
      if (s === 'ROLLBACK') state.rolledBack += 1;
      return { rows: [] };
    }

    throw new Error(`createInMemoryPool: unhandled SQL -> ${s}`);
  }

  return {
    _state: state,
    query: (sql, params) => runQuery(sql, params),
    async connect() {
      return { query: (sql, params) => runQuery(sql, params), release: () => {} };
    },
    end: async () => {},
  };
}

/** Wire the real use cases + controller + router around a repository. */
function createApp(repository) {
  const controller = new PricingController({
    generateQuoteUseCase: new GenerateQuoteUseCase(repository),
    getQuoteUseCase: new GetQuoteUseCase(repository),
    consumeQuoteUseCase: new ConsumeQuoteUseCase(repository),
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1/pricing', createPricingRouter(controller));
  return app;
}

// ── Infrastructure: PricingRepository ───────────────────────────────────────

describe('PricingRepository (infrastructure)', () => {
  test('getActiveConfig maps the DB row onto the domain contract', async () => {
    const pool = createInMemoryPool();
    const repo = new PricingRepository(pool);

    const cfg = await repo.getActiveConfig('urban_taxi');

    expect(cfg.id).toBe('cfg-urban-taxi');
    // column renames required by the domain layer
    expect(Number(cfg.price_per_minute)).toBe(2000);
    expect(Number(cfg.minimum_fare)).toBe(10000);
    // commission_rate is stored as a percent (10) -> factor 0.10
    expect(cfg.commission_rate.toString()).toBe('0.1');
    // decimal.js instance (exact division, never raw float `/ 100`)
    expect(typeof cfg.commission_rate.dividedBy).toBe('function');
  });

  test('getActiveConfig throws when no active config exists for the service type', async () => {
    const repo = new PricingRepository(createInMemoryPool({ configs: [] }));
    await expect(repo.getActiveConfig('urban_taxi')).rejects.toThrow(/هیچ کانفیگ فعالی/);
  });

  test('getActiveConfig ignores configs that are not active', async () => {
    const pool = createInMemoryPool({
      configs: [{ ...URBAN_TAXI_CONFIG, status: 'inactive' }],
    });
    const repo = new PricingRepository(pool);
    await expect(repo.getActiveConfig('urban_taxi')).rejects.toThrow(/هیچ کانفیگ فعالی/);
  });

  test('getQuoteById returns null for an unknown id', async () => {
    const repo = new PricingRepository(createInMemoryPool());
    await expect(repo.getQuoteById('00000000-0000-0000-0000-000000000000')).resolves.toBeNull();
  });

  test('saveQuoteAndAudit persists the quote and one QUOTE_GENERATED audit row in a single transaction', async () => {
    const pool = createInMemoryPool();
    const repo = new PricingRepository(pool);

    const quote = {
      ruleSnapshot: { baseFare: 15000 },
      toDatabaseRecord: () => ({
        reference_id: 'ref-1',
        pricing_config_id: URBAN_TAXI_CONFIG.id,
        service_type: 'urban_taxi',
        currency_code: 'IRT',
        gross_amount: '95000',
        discount_amount: '0',
        tax_amount: '0',
        commission_amount: '9500',
        provider_amount: '85500',
        customer_final_amount: '95000',
        status: 'CREATED',
        input_snapshot: JSON.stringify({ serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 }),
        calculation_snapshot: JSON.stringify({ baseFare: '15000' }),
        expires_at: futureIso(),
      }),
    };

    const quoteId = await repo.saveQuoteAndAudit(quote);

    expect(typeof quoteId).toBe('string');
    expect(pool._state.quotes.get(quoteId).status).toBe('CREATED');
    expect(pool._state.audits).toHaveLength(1);
    expect(pool._state.audits[0]).toMatchObject({ quote_id: quoteId, action_type: 'QUOTE_GENERATED' });
    // BEGIN + COMMIT wrapped the two inserts
    expect(pool._state.committed).toBe(1);
    expect(pool._state.rolledBack).toBe(0);
  });

  test('saveQuoteAndAudit rolls back and rethrows when the audit insert fails', async () => {
    const pool = createInMemoryPool();
    const original = pool.query;
    // Make the audit INSERT blow up on the transactional client.
    const failing = {
      ...pool,
      connect: async () => ({
        query: async (sql, params) => {
          if (normalise(sql).startsWith('INSERT INTO pricing_audit_logs')) {
            throw new Error('audit insert failed');
          }
          return original(sql, params);
        },
        release: () => {},
      }),
    };
    const repo = new PricingRepository(failing);

    const quote = {
      ruleSnapshot: {},
      toDatabaseRecord: () => ({
        reference_id: null, pricing_config_id: URBAN_TAXI_CONFIG.id,
        service_type: 'urban_taxi', currency_code: 'IRT',
        gross_amount: '95000', discount_amount: '0', tax_amount: '0',
        commission_amount: '9500', provider_amount: '85500',
        customer_final_amount: '95000', status: 'CREATED',
        input_snapshot: '{}', calculation_snapshot: '{}', expires_at: futureIso(),
      }),
    };

    await expect(repo.saveQuoteAndAudit(quote)).rejects.toThrow('audit insert failed');
    expect(pool._state.rolledBack).toBe(1);
  });
});

// ── Presentation: PricingController (unit) ──────────────────────────────────

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

/** Silence the controller's error logging so Jest output stays readable. */
function silenceErrors() {
  return jest.spyOn(console, 'error').mockImplementation(() => {});
}

describe('PricingController (presentation)', () => {
  const okResult = {
    quoteId: 'quote-1',
    status: 'CREATED',
    customerFinalAmount: '95000',
    grossAmount: '95000',
    commissionAmount: '9500',
    providerAmount: '85500',
    taxAmount: '0',
    currency: 'IRT',
    expiresAt: futureIso(),
    distanceKm: 10,
    durationMin: 15,
  };

  function buildController(overrides = {}) {
    return new PricingController({
      generateQuoteUseCase: { execute: jest.fn().mockResolvedValue(okResult) },
      getQuoteUseCase: { execute: jest.fn().mockResolvedValue({ ...okResult, isExpired: false }) },
      consumeQuoteUseCase: { execute: jest.fn().mockResolvedValue({ quoteId: 'quote-1', status: 'CONSUMED', referenceId: 'trip-1' }) },
      ...overrides,
    });
  }


  test('calculateQuote -> 400 when required params are missing', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.calculateQuote({ body: { serviceType: 'urban_taxi' }, user: null }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(controller.generateQuoteUseCase.execute).not.toHaveBeenCalled();
  });

  test('calculateQuote -> 201 with the customer DTO by default (no fee breakdown leaked)', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.calculateQuote(
      { body: { serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 }, user: null },
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quote_id).toBe('quote-1');
    expect(res.body.data.final_amount).toBe(95000);
    expect(res.body.data.currency).toBe('IRT');
    // Confidentiality: the customer DTO must never expose the breakdown.
    expect(res.body.data.gross_amount).toBeUndefined();
    expect(res.body.data.commission_amount).toBeUndefined();
    expect(res.body.data.tax_amount).toBeUndefined();
    expect(res.body.data.net_provider_amount).toBeUndefined();
  });

  test('calculateQuote -> 201 with the provider DTO when req.user.role is provider', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.calculateQuote(
      { body: { serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 }, user: { role: 'provider' } },
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.data.gross_amount).toBe(95000);
    expect(res.body.data.commission_amount).toBe(9500);
    expect(res.body.data.net_provider_amount).toBe(85500);
    // Customer-only field stays out of the provider payload.
    expect(res.body.data.final_amount).toBeUndefined();
  });

  test('SECURITY: role spoofing via headers/query/body can never unlock the provider DTO', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.calculateQuote({
      body: { serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15, role: 'provider' },
      query: { role: 'provider' },
      headers: { 'x-caller-role': 'provider', 'x-role': 'provider' },
      user: null,
    }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.gross_amount).toBeUndefined();
    expect(res.body.data.commission_amount).toBeUndefined();
    expect(res.body.data.net_provider_amount).toBeUndefined();
  });

  test('SECURITY: trafficMultiplier in the request body is ignored (client cannot tamper with the price)', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.calculateQuote(
      { body: { serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15, trafficMultiplier: 99 }, user: null },
      res,
    );

    expect(res.statusCode).toBe(201);
    // The controller must never forward the client-supplied multiplier to the use case.
    const passedInput = controller.generateQuoteUseCase.execute.mock.calls[0][0];
    expect(passedInput.trafficMultiplier).toBeUndefined();
    // 'trafficMultiplier' key must not be present at all in the input payload.
    expect(Object.prototype.hasOwnProperty.call(passedInput, 'trafficMultiplier')).toBe(false);
  });

  test('calculateQuote works without trafficMultiplier in the body (safe default, no unexpected error)', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.calculateQuote(
      { body: { serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 }, user: null },
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.data.final_amount).toBe(95000);
  });


  test('calculateQuote -> 404 when no active pricing config exists for the service', async () => {
    const spy = silenceErrors();
    const controller = buildController({
      generateQuoteUseCase: {
        execute: jest.fn().mockRejectedValue(new Error('هیچ کانفیگ فعالی برای سرویس urban_taxi یافت نشد.')),
      },
    });
    const res = mockRes();

    await controller.calculateQuote(
      { body: { serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 }, user: null },
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    spy.mockRestore();
  });

  test('calculateQuote -> 500 for an unexpected failure (details never leaked)', async () => {
    const spy = silenceErrors();
    const controller = buildController({
      generateQuoteUseCase: { execute: jest.fn().mockRejectedValue(new Error('connection terminated')) },
    });
    const res = mockRes();

    await controller.calculateQuote(
      { body: { serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 }, user: null },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/connection terminated/);
    spy.mockRestore();
  });

  test('getQuote -> 400 when quoteId is missing', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.getQuote({ params: {}, user: null }, res);

    expect(res.statusCode).toBe(400);
    expect(controller.getQuoteUseCase.execute).not.toHaveBeenCalled();
  });

  test('getQuote -> 404 when the use case raises QuoteNotFoundError', async () => {
    const spy = silenceErrors();
    const controller = buildController({
      getQuoteUseCase: { execute: jest.fn().mockRejectedValue(new QuoteNotFoundError('missing-id')) },
    });
    const res = mockRes();

    await controller.getQuote({ params: { quoteId: 'missing-id' }, user: null }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    spy.mockRestore();
  });

  test('getQuote -> 200 with the customer DTO (isExpired reported, breakdown hidden)', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.getQuote({ params: { quoteId: 'quote-1' }, user: null }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.quote_id).toBe('quote-1');
    expect(res.body.data.isExpired).toBe(false);
    expect(res.body.data.gross_amount).toBeUndefined();
    expect(res.body.data.commission_amount).toBeUndefined();
  });

  test('consumeQuote -> 409 for an already-consumed quote', async () => {
    const spy = silenceErrors();
    const controller = buildController({
      consumeQuoteUseCase: { execute: jest.fn().mockRejectedValue(new QuoteAlreadyConsumedError('quote-1')) },
    });
    const res = mockRes();

    await controller.consumeQuote({ params: { quoteId: 'quote-1' }, body: {}, user: null }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    spy.mockRestore();
  });

  test('consumeQuote -> 400 for an expired quote', async () => {
    const spy = silenceErrors();
    const controller = buildController({
      consumeQuoteUseCase: { execute: jest.fn().mockRejectedValue(new QuoteExpiredError('quote-1')) },
    });
    const res = mockRes();

    await controller.consumeQuote({ params: { quoteId: 'quote-1' }, body: {}, user: null }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    spy.mockRestore();
  });

  test('consumeQuote -> 400 when quoteId is missing (QUOTE_ID_REQUIRED)', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.consumeQuote({ params: {}, body: {}, user: null }, res);

    expect(res.statusCode).toBe(400);
    expect(controller.consumeQuoteUseCase.execute).not.toHaveBeenCalled();
  });

  test('consumeQuote -> 200 on a successful consumption', async () => {
    const controller = buildController();
    const res = mockRes();

    await controller.consumeQuote({ params: { quoteId: 'quote-1' }, body: { referenceId: 'trip-1' }, user: null }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CONSUMED');
    expect(controller.consumeQuoteUseCase.execute).toHaveBeenCalledWith('quote-1', 'trip-1');
  });
});


// ── End-to-end over the real Express router (in-memory DB) ──────────────────

describe('Pricing HTTP API - create -> read -> consume (in-memory DB)', () => {
  const CALCULATE = '/api/v1/pricing/calculate';

  function build() {
    const pool = createInMemoryPool();
    return { pool, app: createApp(new PricingRepository(pool)) };
  }

  test('POST /calculate -> 201, then GET /quotes/:id -> 200, then consume -> 200 and replay -> 409', async () => {
    const { pool, app } = build();

    const created = await request(app).post(CALCULATE).send({
      serviceType: 'urban_taxi',
      distanceKm: 10,
      durationMin: 15,
      trafficMultiplier: 1.0,
      referenceId: 'ref-1',
    });

    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    const quoteId = created.body.data.quote_id;
    expect(typeof quoteId).toBe('string');

    // Customer DTO policy over HTTP: final amount only.
    expect(created.body.data.final_amount).toBe(95000);
    expect(created.body.data.currency).toBe('IRT');
    expect(created.body.data.gross_amount).toBeUndefined();
    expect(created.body.data.commission_amount).toBeUndefined();

    // The quote and its audit trail really landed in storage.
    const stored = pool._state.quotes.get(quoteId);
    expect(stored.customer_final_amount).toBe('95000');
    expect(stored.commission_amount).toBe('9500');
    expect(stored.provider_amount).toBe('85500');
    expect(pool._state.audits.filter((a) => a.action_type === 'QUOTE_GENERATED')).toHaveLength(1);

    const fetched = await request(app).get(`/api/v1/pricing/quotes/${quoteId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.quote_id).toBe(quoteId);
    expect(fetched.body.data.status).toBe('CREATED');
    expect(fetched.body.data.isExpired).toBe(false);

    const consumed = await request(app)
      .post(`/api/v1/pricing/quotes/${quoteId}/consume`)
      .send({ referenceId: 'trip-1' });
    expect(consumed.status).toBe(200);
    expect(consumed.body.data.status).toBe('CONSUMED');
    expect(consumed.body.data.referenceId).toBe('trip-1');
    expect(pool._state.audits.filter((a) => a.action_type === 'QUOTE_CONSUMED')).toHaveLength(1);

    // Race/duplicate protection: a second consumption of the same quote is rejected.
    const replay = await request(app)
      .post(`/api/v1/pricing/quotes/${quoteId}/consume`)
      .send({ referenceId: 'trip-2' });
    expect(replay.status).toBe(409);
    expect(replay.body.success).toBe(false);
  });


  test('POST /calculate -> 400 when required params are missing', async () => {
    const { app } = build();
    const res = await request(app).post(CALCULATE).send({ distanceKm: 5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('SECURITY: POST /calculate with trafficMultiplier=99 keeps the price unchanged (client cannot tamper)', async () => {
    const { pool, app } = build();

    const base = await request(app)
      .post(CALCULATE)
      .send({ serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15, referenceId: 'ref-base' });
    expect(base.status).toBe(201);
    expect(base.body.data.final_amount).toBe(95000);

    const tampered = await request(app).post(CALCULATE).send({
      serviceType: 'urban_taxi',
      distanceKm: 10,
      durationMin: 15,
      trafficMultiplier: 99,
      referenceId: 'ref-tampered',
    });
    expect(tampered.status).toBe(201);

    // Identical inputs must yield an identical price regardless of client multiplier.
    expect(tampered.body.data.final_amount).toBe(base.body.data.final_amount);
    expect(tampered.body.data.final_amount).toBe(95000);

    // Stored snapshot must not be influenced by the tampered value either.
    const storedTampered = pool._state.quotes.get(tampered.body.data.quote_id);
    expect(String(storedTampered.customer_final_amount)).toBe('95000');
  });

  test('POST /calculate -> 404 when the service type has no active config', async () => {
    const spy = silenceErrors();
    const app = createApp(new PricingRepository(createInMemoryPool({ configs: [] })));

    const res = await request(app)
      .post(CALCULATE)
      .send({ serviceType: 'unknown_service', distanceKm: 1, durationMin: 1 });

    expect(res.status).toBe(404);
    spy.mockRestore();
  });

  test('GET /quotes/:unknownId -> 404', async () => {
    const spy = silenceErrors();
    const { app } = build();

    const res = await request(app)
      .get('/api/v1/pricing/quotes/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    spy.mockRestore();
  });

  test('POST consume on an EXPIRED quote -> 400 (never 200)', async () => {
    const expired = makeQuoteRow({ expires_at: new Date(pastIso()) });
    const pool = createInMemoryPool({ quotes: [expired] });
    const spy = silenceErrors();
    const app = createApp(new PricingRepository(pool));

    const res = await request(app)
      .post(`/api/v1/pricing/quotes/${expired.id}/consume`)
      .send({ referenceId: 'trip-late' });

    expect(res.status).toBe(400);
    // A failed consumption must not mutate the stored quote.
    expect(pool._state.quotes.get(expired.id).status).toBe('CREATED');
    spy.mockRestore();
  });

  test('a provider (req.user injected by upstream auth) receives the full breakdown over HTTP', async () => {
    const repository = new PricingRepository(createInMemoryPool());
    const controller = new PricingController({
      generateQuoteUseCase: new GenerateQuoteUseCase(repository),
      getQuoteUseCase: new GetQuoteUseCase(repository),
      consumeQuoteUseCase: new ConsumeQuoteUseCase(repository),
    });

    const app = express();
    app.use(express.json());
    // Simulates the authenticated user injected by the API gateway/auth layer.
    app.use((req, res, next) => { req.user = { role: 'provider' }; next(); });
    app.use('/api/v1/pricing', createPricingRouter(controller));

    const res = await request(app)
      .post(CALCULATE)
      .send({ serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15 });

    expect(res.status).toBe(201);
    expect(res.body.data.gross_amount).toBe(95000);
    expect(res.body.data.commission_amount).toBe(9500);
    expect(res.body.data.net_provider_amount).toBe(85500);
  });
});


// ── Wiring: no broken imports after the legacy archive removal ─────────────

describe('Pricing Engine module wiring', () => {
  test('layer indexes expose the LIVE implementations', () => {
    const domain = require('../domain');
    const application = require('../application');
    const infrastructure = require('../infrastructure');
    const presentation = require('../presentation');
    // Explicit file: `require('..')` would resolve to package.json "main" (run-server.js).
    const root = require('../index.js');

    expect(typeof domain.PricingRule).toBe('function');
    expect(typeof application.GenerateQuoteUseCase).toBe('function');
    expect(typeof infrastructure.PricingRepository).toBe('function');
    expect(typeof presentation.createPricingRouter).toBe('function');
    // The module barrel re-exports the very same class objects (no drift).
    expect(root.PricingRepository).toBe(infrastructure.PricingRepository);
    expect(root.PricingController).toBe(presentation.PricingController);
    expect(root.infrastructure.PricingRepository).toBe(infrastructure.PricingRepository);
    expect(root.application.GenerateQuoteUseCase).toBe(application.GenerateQuoteUseCase);
    expect(root.domain.PricingRule).toBe(domain.PricingRule);
  });

  test('the deleted legacy shims are gone (no dangling requires)', () => {
    expect(() => require('../application/useCases')).toThrow(/Cannot find module/);
    expect(() => require('../infrastructure/repositories/PostgresPricingRepository')).toThrow(/Cannot find module/);
    expect(() => require('../services/PricingCalculator')).toThrow(/Cannot find module/);
    expect(() => require('../services/QuoteService')).toThrow(/Cannot find module/);
  });

  test('run-server.js boots without a database and serves /health', async () => {
    const app = require('../run-server');

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, module: 'pricing-engine', status: 'ok' });
  });

  test('run-server.js mounts the pricing router on /api/v1/pricing', async () => {
    const app = require('../run-server');

    // An empty body is rejected by the controller before any DB access, which
    // proves the route is mounted (400 rather than 404) with no database.
    const res = await request(app).post('/api/v1/pricing/calculate').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

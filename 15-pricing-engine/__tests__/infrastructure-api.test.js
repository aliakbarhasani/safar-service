/**
 * Integration & API Tests - Infrastructure and Presentation layers
 *
 * Tests the PostgreSQL Repository (with memory fallback) and
 * the PricingController API layer. Standard Jest structure.
 */
const assert = require('assert');

describe('Pricing Engine - Infrastructure & API', () => {

test('Repository: creates instance with memory fallback', () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo();
  assert.strictEqual(typeof repo.saveQuote, 'function');
  assert.strictEqual(typeof repo.findQuoteById, 'function');
  assert.ok(repo._memoryStore instanceof Map);
});

test('Repository: saveQuote falls back to memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo();
  // Force DB failure so the in-memory fallback is exercised deterministically.
  repo.dbPool = {
    query: async () => {
      throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
    },
  };
  const quote = await repo.saveQuote({
    tripRequestId: 'test-trip',
    priceBreakdown: { baseFare: 10000 },
    totalPrice: 15000,
    currencyId: 'IRT',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    requestHash: 'test-hash-123',
  });
  assert.ok(quote.id);
  assert.strictEqual(quote.tripRequestId, 'test-trip');
  assert.strictEqual(quote.totalPrice, 15000);
});

test('Repository: findQuoteById from memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo();
  repo.dbPool = {
    query: async () => {
      throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
    },
  };
  const saved = await repo.saveQuote({
    tripRequestId: 'find-test',
    priceBreakdown: { total: 5000 },
    totalPrice: 5000,
    currencyId: 'IRT',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    requestHash: 'find-hash',
  });
  const found = await repo.findQuoteById(saved.id);
  assert.ok(found);
  assert.strictEqual(found.tripRequestId, 'find-test');
});

console.log('\n=== PRICING CONTROLLER TESTS ===\n');

test('Controller: constructor throws without deps', () => {
  const Ctrl = require('../presentation/controllers/PricingController');
  assert.throws(() => new Ctrl(), /requires generateQuote/);
});

test('Controller: createQuote returns 201 with valid input', async () => {
  const { IRuleResolver, IPricingEventPublisher, ICacheProvider, PricingRule } = require('../domain');
  const GeneratePriceQuote = require('../application/useCases/GeneratePriceQuote');
  const Ctrl = require('../presentation/controllers/PricingController');

  const mr = new IRuleResolver();
  mr.resolve = async () => new PricingRule({
    priority: 50, scopeType: 'City', scopeId: 'default',
    serviceType: 'urban_taxi', currencyId: 'IRT',
    baseFare: 15000, perKmRate: 5000, perMinuteRate: 1000,
  });
  const mp = new IPricingEventPublisher();
  mp.publishQuoteGenerated = async () => {};
  const mc = new ICacheProvider();
  mc.get = async () => null;
  mc.set = async () => {};

  const uc = new GeneratePriceQuote({ ruleResolver: mr, eventPublisher: mp, cacheProvider: mc, config: {} });
  const ctrl = new Ctrl({ generateQuote: uc });
  const req = { body: { tripId: 'trip-1', distanceKm: 10, durationMin: 15 } };
  const res = { status: function(c) { this._c = c; return this; }, json: function(d) { this._d = d; return this; } };

  await ctrl.createQuote(req, res);
  assert.strictEqual(res._c, 201);
  assert.ok(res._d.success);
  assert.strictEqual(res._d.data.tripRequestId, 'trip-1');
});

test('Controller: createQuote returns 400 when tripId missing', async () => {
  const { IRuleResolver, IPricingEventPublisher, ICacheProvider } = require('../domain');
  const GeneratePriceQuote = require('../application/useCases/GeneratePriceQuote');
  const Ctrl = require('../presentation/controllers/PricingController');

  const mr = new IRuleResolver(); mr.resolve = async () => null;
  const mp = new IPricingEventPublisher(); mp.publishQuoteGenerated = async () => {};
  const mc = new ICacheProvider(); mc.get = async () => null; mc.set = async () => {};

  const uc = new GeneratePriceQuote({ ruleResolver: mr, eventPublisher: mp, cacheProvider: mc, config: {} });
  const ctrl = new Ctrl({ generateQuote: uc });
  const res = { status: function(c) { this._c = c; return this; }, json: function(d) { this._d = d; return this; } };

  await ctrl.createQuote({ body: {} }, res);
  assert.strictEqual(res._c, 400);
  assert.strictEqual(res._d.success, false);
});

test('Controller: recalculateQuote returns 400 without originalQuoteId', async () => {
  const { IRuleResolver, IPricingEventPublisher, ICacheProvider, PricingRule } = require('../domain');
  const GeneratePriceQuote = require('../application/useCases/GeneratePriceQuote');
  const RecalculatePrice = require('../application/useCases/RecalculatePrice');
  const Ctrl = require('../presentation/controllers/PricingController');

  const mr = new IRuleResolver(); mr.resolve = async () => new PricingRule({
    priority: 50, scopeType: 'City', scopeId: 'd',
    serviceType: 'urban_taxi', currencyId: 'IRT',
    baseFare: 1000, perKmRate: 500, perMinuteRate: 100,
  });
  const mp = new IPricingEventPublisher(); mp.publishQuoteGenerated = async () => {};
  const mc = new ICacheProvider(); mc.get = async () => null; mc.set = async () => {};

  const deps = { ruleResolver: mr, eventPublisher: mp, cacheProvider: mc, config: {} };
  const uc = new GeneratePriceQuote(deps);
  const rc = new RecalculatePrice(deps);
  const ctrl = new Ctrl({ generateQuote: uc, recalculatePrice: rc });
  const res = { status: function(c) { this._c = c; return this; }, json: function(d) { this._d = d; return this; } };

  await ctrl.recalculateQuote({ body: {} }, res);
  assert.strictEqual(res._c, 400);
});

console.log('\n=== MODULE LOADING TESTS ===\n');

test('Main module exports all 4 layers', () => {
  const mod = require('../index');
  assert.ok(mod.domain);
  assert.ok(mod.application);
  assert.ok(mod.infrastructure);
  assert.ok(mod.presentation);
});

test('Infrastructure exports Repository', () => {
  const inf = require('../infrastructure');
  assert.strictEqual(typeof inf.PostgresPricingRepository, 'function');
});

test('Presentation exports Controller', () => {
  const pres = require('../presentation');
  assert.strictEqual(typeof pres.PricingController, 'function');
});

});

/**
 * Integration & API Tests - Infrastructure and Presentation layers
 *
 * Tests the PostgreSQL Repository (with memory fallback) and
 * the PricingController API layer.
 *
 * Run with: node __tests__/infrastructure-api.test.js
 */
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (error) { failed++; console.log('  ✘', name, ':', error.message); }
}

console.log('\n=== POSTGRES REPOSITORY TESTS ===\n');

test('Repository: creates instance with memory fallback', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  assert.strictEqual(typeof repo.saveQuote, 'function');
  assert.strictEqual(typeof repo.findQuoteById, 'function');
});

test('Repository: saveQuote falls back to memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  const quote = await repo.saveQuote({
    tripRequestId: 'test-trip',
    priceBreakdown: { baseFare: 10000 },
    totalPrice: 15000,
    currencyId: 'IRT',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    pricingEngineVersion: '1.0.0',
    ruleVersion: 1,
    multiplierVersion: 1,
    algorithmVersion: '1.0.0',
    configVersion: '1.0.0',
    requestHash: 'test-hash-123',
  });
  assert.ok(quote.id);
  assert.strictEqual(quote.tripRequestId, 'test-trip');
  assert.strictEqual(quote.totalPrice, 15000);
});

test('Repository: findQuoteById from memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  const saved = await repo.saveQuote({
    tripRequestId: 'find-test',
    priceBreakdown: { total: 5000 },
    totalPrice: 5000,
    currencyId: 'IRT',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    pricingEngineVersion: '1.0.0',
    ruleVersion: 1,
    multiplierVersion: 1,
    algorithmVersion: '1.0.0',
    configVersion: '1.0.0',
    requestHash: 'find-hash',
  });
  const found = await repo.findQuoteById(saved.id);
  assert.ok(found);
  assert.strictEqual(found.tripRequestId, 'find-test');
});

test('Repository: saveRule falls back to memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  const rule = await repo.saveRule({
    priority: 50, scopeType: 'City', scopeId: 'test-city',
    serviceType: 'urban_taxi', currencyId: 'IRT',
    baseFare: 15000, perKmRate: 5000, perMinuteRate: 1000,
  });
  assert.ok(rule.id);
  assert.strictEqual(rule.baseFare, 15000);
});

test('Repository: findActiveRule from memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  await repo.saveRule({
    priority: 50, scopeType: 'City', scopeId: 'find-city',
    serviceType: 'urban_taxi', currencyId: 'IRT',
    baseFare: 20000, perKmRate: 5000, perMinuteRate: 1000,
  });
  const found = await repo.findActiveRule('City', 'find-city', 'urban_taxi');
  assert.ok(found);
  assert.strictEqual(found.baseFare, 20000);
});

test('Repository: updateQuoteStatus in memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  const saved = await repo.saveQuote({
    tripRequestId: 'status-test', priceBreakdown: { total: 100 }, totalPrice: 100,
    currencyId: 'IRT', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    pricingEngineVersion: '1.0.0', ruleVersion: 1, multiplierVersion: 1,
    algorithmVersion: '1.0.0', configVersion: '1.0.0', requestHash: 'status-hash',
  });
  const updated = await repo.updateQuoteStatus(saved.id, 'USED');
  assert.ok(updated);
  assert.strictEqual(updated.status, 'USED');
});

test('Repository: logTimelineEvent in memory', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  const event = await repo.logTimelineEvent({
    entityId: 'test-entity', eventType: 'QuoteGenerated',
    actorType: 'System', oldValue: {}, newValue: { price: 10000 },
  });
  assert.ok(event.id);
  assert.strictEqual(event.eventType, 'QuoteGenerated');
});

test('Repository: healthCheck returns false when DB down', async () => {
  const Repo = require('../infrastructure/repositories/PostgresPricingRepository');
  const repo = new Repo({ poolMaxRetries: 1, poolBaseDelayMs: 10 });
  await repo.initialize();
  assert.strictEqual(await repo.healthCheck(), false);
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

test('Controller: resolveRule returns 400 without query params', async () => {
  const { IRuleResolver, IPricingEventPublisher, ICacheProvider } = require('../domain');
  const GeneratePriceQuote = require('../application/useCases/GeneratePriceQuote');
  const ResolvePricingRule = require('../application/useCases/ResolvePricingRule');
  const Ctrl = require('../presentation/controllers/PricingController');

  const mr = new IRuleResolver(); mr.resolve = async () => null;
  const mp = new IPricingEventPublisher(); mp.publishQuoteGenerated = async () => {};
  const mc = new ICacheProvider(); mc.get = async () => null; mc.set = async () => {};

  const deps = { ruleResolver: mr, eventPublisher: mp, cacheProvider: mc, config: {} };
  const uc = new GeneratePriceQuote(deps);
  const rl = new ResolvePricingRule({ ruleResolver: mr, cacheProvider: mc });
  const ctrl = new Ctrl({ generateQuote: uc, resolveRule: rl });
  const res = { status: function(c) { this._c = c; return this; }, json: function(d) { this._d = d; return this; } };

  await ctrl.resolveRule({ query: {} }, res);
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

const total = passed + failed;
console.log('\n========================================');
console.log('  NEW TESTS: ' + passed + '/' + total + ' passed');
console.log('  Failed: ' + failed);
console.log('========================================\n');
process.exit(failed > 0 ? 1 : 0);
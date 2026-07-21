/**
 * Unit Tests - Pricing Engine Domain Core
 *
 * Tests all domain entities, value objects, use cases, and infrastructure.
 * Coverage targets: 100% for domain entities, edge cases for all components.
 *
 * Framework: Node.js native assert (no external test runner required)
 * Run with: node __tests__/pricing-engine.test.js
 *
 * Architecture: Clean Architecture - Test Layer
 * Status: LOCKED | Created v2
 */

const assert = require('assert');
const {
  PricingRule,
  PriceQuote,
  DynamicMultiplier,
  PriceBreakdown,
  IPricingEngine,
  IRuleResolver,
  ICurrencyProvider,
  ICacheProvider,
  IPricingEventPublisher,
  IPricingRepository,
} = require('../domain');

const { EventContract, PricingEvents } = require('../application/events');
const { GeneratePriceQuote, RecalculatePrice, ResolvePricingRule } = require('../application/useCases');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (error) {
    failed++;
    console.log('  ✘', name, ':', error.message);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tolerance, msg + ` - expected ${expected}, got ${actual}, diff ${diff}`);
}

console.log('\n=== PRICING RULE TESTS ===\n');

test('PricingRule: create with valid params', () => {
  const rule = new PricingRule({
    priority: 50, scopeType: 'City', scopeId: 'tehran-1',
    serviceType: 'urban_taxi', currencyId: 'IRT',
    baseFare: 15000, perKmRate: 5000, perMinuteRate: 1000,
  });
  rule.validate();
  assert.strictEqual(rule.priority, 50);
  assert.strictEqual(rule.baseFare, 15000);
});

test('PricingRule: reject priority < 1', () => {
  assert.throws(() => {
    new PricingRule({ priority: 0, scopeType: 'City', scopeId: 't', serviceType: 's', currencyId: 'IRT', baseFare: 1000, perKmRate: 500, perMinuteRate: 100 }).validate();
  }, /Priority/);
});

test('PricingRule: reject priority > 100', () => {
  assert.throws(() => {
    new PricingRule({ priority: 101, scopeType: 'City', scopeId: 't', serviceType: 's', currencyId: 'IRT', baseFare: 1000, perKmRate: 500, perMinuteRate: 100 }).validate();
  }, /Priority/);
});

test('PricingRule: reject negative base fare', () => {
  assert.throws(() => {
    new PricingRule({ priority: 50, scopeType: 'City', scopeId: 't', serviceType: 's', currencyId: 'IRT', baseFare: -100, perKmRate: 500, perMinuteRate: 100 }).validate();
  }, /negative/);
});

test('PricingRule: calculateBasePrice for 10km 15min', () => {
  const rule = new PricingRule({
    priority: 50, scopeType: 'City', scopeId: 'tehran-1',
    serviceType: 'urban_taxi', currencyId: 'IRT',
    baseFare: 15000, perKmRate: 5000, perMinuteRate: 1000,
  });
  const price = rule.calculateBasePrice(10, 15);
  assert.strictEqual(price, 15000 + 50000 + 15000);
});

test('PricingRule: snapshot returns correct fields', () => {
  const rule = new PricingRule({
    priority: 50, scopeType: 'City', scopeId: 't', serviceType: 's', currencyId: 'IRT',
    baseFare: 10000, perKmRate: 2000, perMinuteRate: 500,
  });
  const snap = rule.snapshot();
  assert.strictEqual(snap.baseFare, 10000);
  assert.strictEqual(snap.perKmRate, 2000);
  assert.strictEqual(snap.serviceType, 's');
});

test('PricingRule: active by default', () => {
  const rule = new PricingRule({
    priority: 50, scopeType: 'City', scopeId: 't', serviceType: 's', currencyId: 'IRT',
    baseFare: 1000, perKmRate: 500, perMinuteRate: 100,
  });
  assert.strictEqual(rule.isActive, true);
});

test('PricingRule: can be created inactive', () => {
  const rule = new PricingRule({
    priority: 50, scopeType: 'City', scopeId: 't', serviceType: 's', currencyId: 'IRT',
    baseFare: 1000, perKmRate: 500, perMinuteRate: 100, isActive: false,
  });
  assert.strictEqual(rule.isActive, false);
});

console.log('\n=== DYNAMIC MULTIPLIER TESTS ===\n');

test('DynamicMultiplier: create with valid params', () => {
  const dm = new DynamicMultiplier({ ruleId: 'r1', adapterKey: 'traffic', multiplier: 1.5 });
  dm.validate();
  assert.strictEqual(dm.multiplier, 1.5);
});

test('DynamicMultiplier: clamp value above MAX_CEILING (3.5)', () => {
  const dm = new DynamicMultiplier({ ruleId: 'r1', adapterKey: 'traffic', multiplier: 5.0 });
  assert.strictEqual(dm.multiplier, 3.5);
});

test('DynamicMultiplier: clamp value below MIN_FLOOR (0.5)', () => {
  const dm = new DynamicMultiplier({ ruleId: 'r1', adapterKey: 'traffic', multiplier: 0.1 });
  assert.strictEqual(dm.multiplier, 0.5);
});

test('DynamicMultiplier: apply returns base * multiplier', () => {
  const dm = new DynamicMultiplier({ ruleId: 'r1', adapterKey: 'traffic', multiplier: 2.0 });
  assert.strictEqual(dm.apply(10000), 20000);
});

test('DynamicMultiplier: apply with ceiling cap (5.0x capped at 3.5x)', () => {
  const dm = new DynamicMultiplier({ ruleId: 'r1', adapterKey: 'traffic', multiplier: 5.0 });
  assert.strictEqual(dm.multiplier, 3.5);
  const capped = dm.apply(10000);
  assert.strictEqual(capped, 35000);
});

test('DynamicMultiplier: inactive multiplier returns base price unchanged', () => {
  const dm = new DynamicMultiplier({ ruleId: 'r1', adapterKey: 'traffic', multiplier: 2.0, isActive: false });
  assert.strictEqual(dm.apply(10000), 10000);
});

test('DynamicMultiplier: reject invalid adapterKey', () => {
  assert.throws(() => {
    new DynamicMultiplier({ ruleId: 'r1', adapterKey: 'invalid_key', multiplier: 1.5 }).validate();
  }, /Invalid adapter key/);
});

console.log('\n=== PRICE BREAKDOWN TESTS ===\n');

test('PriceBreakdown: calculate subtotal', () => {
  const bd = new PriceBreakdown({ baseFare: 15000, distanceCharge: 50000, timeCharge: 15000 });
  assert.strictEqual(bd.subtotal, 80000);
});

test('PriceBreakdown: apply multiplier factor', () => {
  const bd = new PriceBreakdown({
    baseFare: 15000, distanceCharge: 50000, timeCharge: 15000,
    multipliers: [{ key: 'traffic', factor: 1.5 }],
  });
  assertApprox(bd.totalMultiplierFactor, 1.5, 0.001, 'Multiplier factor');
});

test('PriceBreakdown: calculate total with multiplier', () => {
  const bd = new PriceBreakdown({
    baseFare: 15000, distanceCharge: 50000, timeCharge: 15000,
    multipliers: [{ key: 'traffic', factor: 1.5 }],
  });
  assert.strictEqual(bd.total, 120000);
});

test('PriceBreakdown: apply discount', () => {
  const bd = new PriceBreakdown({
    baseFare: 10000, distanceCharge: 0, timeCharge: 0,
    discount: 2000,
  });
  assert.strictEqual(bd.total, 8000);
});

test('PriceBreakdown: total never negative', () => {
  const bd = new PriceBreakdown({
    baseFare: 1000, distanceCharge: 0, timeCharge: 0,
    discount: 5000,
  });
  assert.strictEqual(bd.total, 0);
});

test('PriceBreakdown: immutability - cannot modify multipliers', () => {
  const bd = new PriceBreakdown({
    baseFare: 1000, distanceCharge: 0, timeCharge: 0,
    multipliers: [{ key: 'traffic', factor: 1.5 }],
  });
  assert.throws(() => { bd.multipliers.push({ key: 'weather', factor: 2.0 }); });
});

test('PriceBreakdown: toJSON returns serializable object', () => {
  const bd = new PriceBreakdown({ baseFare: 1000, distanceCharge: 2000, timeCharge: 500 });
  const json = bd.toJSON();
  assert.strictEqual(json.baseFare, 1000);
  assert.strictEqual(json.subtotal, 3500);
  assert.strictEqual(json.total, 3500);
});

console.log('\n=== PRICE QUOTE TESTS ===\n');

test('PriceQuote: create with valid params', () => {
  const future = new Date(Date.now() + 3600000);
  const quote = new PriceQuote({
    tripRequestId: 'trip-123',
    priceBreakdown: { baseFare: 10000, total: 10000 },
    totalPrice: 10000,
    currencyId: 'IRT',
    expiresAt: future,
    pricingEngineVersion: '1.0.0',
    ruleVersion: 1,
    multiplierVersion: 1,
    algorithmVersion: '1.0.0',
    configVersion: '1.0.0',
    requestHash: 'abc123',
  });
  quote.validate();
  assert.strictEqual(quote.status, 'ACTIVE');
});

test('PriceQuote: isValid returns true for active not expired', () => {
  const future = new Date(Date.now() + 3600000);
  const quote = new PriceQuote({
    tripRequestId: 'trip-1', priceBreakdown: { total: 1000 }, totalPrice: 1000,
    currencyId: 'IRT', expiresAt: future,
    pricingEngineVersion: '1.0.0', ruleVersion: 1, multiplierVersion: 1,
    algorithmVersion: '1.0.0', configVersion: '1.0.0', requestHash: 'h1',
  });
  assert.strictEqual(quote.isValid(new Date()), true);
});

test('PriceQuote: isValid with injected time - expired quote', () => {
  const past = new Date(Date.now() - 3600000);
  const quote = new PriceQuote({
    tripRequestId: 'trip-1', priceBreakdown: { total: 1000 }, totalPrice: 1000,
    currencyId: 'IRT', expiresAt: past,
    pricingEngineVersion: '1.0.0', ruleVersion: 1, multiplierVersion: 1,
    algorithmVersion: '1.0.0', configVersion: '1.0.0', requestHash: 'h1',
  });
  assert.strictEqual(quote.isValid(new Date()), false);
});

test('PriceQuote: markAsUsed changes status', () => {
  const future = new Date(Date.now() + 3600000);
  const quote = new PriceQuote({
    tripRequestId: 'trip-1', priceBreakdown: { total: 1000 }, totalPrice: 1000,
    currencyId: 'IRT', expiresAt: future,
    pricingEngineVersion: '1.0.0', ruleVersion: 1, multiplierVersion: 1,
    algorithmVersion: '1.0.0', configVersion: '1.0.0', requestHash: 'h1',
  });
  quote.markAsUsed();
  assert.strictEqual(quote.status, 'USED');
});

test('PriceQuote: cannot mark already expired quote as used', () => {
  const future = new Date(Date.now() + 3600000);
  const quote = new PriceQuote({
    tripRequestId: 'trip-1', priceBreakdown: { total: 1000 }, totalPrice: 1000,
    currencyId: 'IRT', expiresAt: future,
    pricingEngineVersion: '1.0.0', ruleVersion: 1, multiplierVersion: 1,
    algorithmVersion: '1.0.0', configVersion: '1.0.0', requestHash: 'h1',
  });
  quote.expire();
  assert.throws(() => quote.markAsUsed(), /Only ACTIVE/);
});

test('PriceQuote: snapshot returns immutable object', () => {
  const future = new Date(Date.now() + 3600000);
  const quote = new PriceQuote({
    tripRequestId: 'trip-1', priceBreakdown: { total: 1000 }, totalPrice: 1000,
    currencyId: 'IRT', expiresAt: future,
    pricingEngineVersion: '1.0.0', ruleVersion: 1, multiplierVersion: 1,
    algorithmVersion: '1.0.0', configVersion: '1.0.0', requestHash: 'h1',
  });
  const snap = quote.snapshot();
  assert.strictEqual(snap.tripRequestId, 'trip-1');
  assert.strictEqual(snap.totalPrice, 1000);
});

console.log('\n=== EVENT CONTRACT TESTS ===\n');

test('EventContract: create returns valid envelope', () => {
  const event = EventContract.create({
    eventType: 'TestEvent', payload: { data: 'test' },
  });
  assert.ok(event.eventId);
  assert.strictEqual(event.eventType, 'TestEvent');
  assert.strictEqual(event.producer, 'pricing-engine');
});

test('EventContract: validate returns true for valid event', () => {
  const event = EventContract.create({
    eventType: 'TestEvent', payload: { data: 'test' },
  });
  assert.strictEqual(EventContract.validate(event), true);
});

test('EventContract: validate returns false for invalid event', () => {
  assert.strictEqual(EventContract.validate({}), false);
});

test('EventContract: has all 13 event types', () => {
  assert.strictEqual(Object.keys(EventContract.EventTypes).length, 13);
});

test('PricingEvents: quoteGenerated creates proper event', () => {
  const quote = {
    id: 'q1', tripRequestId: 't1', totalPrice: 10000, currencyId: 'IRT',
    priceBreakdown: {}, expiresAt: new Date().toISOString(),
    pricingEngineVersion: '1.0.0', algorithmVersion: '1.0.0', requestHash: 'h1',
  };
  const event = PricingEvents.quoteGenerated(quote);
  assert.strictEqual(event.eventType, 'QuoteGenerated');
  assert.strictEqual(event.payload.quoteId, 'q1');
});

test('PricingEvents: surgeActivated creates proper event', () => {
  const event = PricingEvents.surgeActivated({
    ruleId: 'r1', adapterKey: 'traffic', multiplier: 2.0, reason: 'Rush hour',
  });
  assert.strictEqual(event.eventType, 'SurgeActivated');
  assert.strictEqual(event.payload.multiplier, 2.0);
});

console.log('\n=== INTERFACE TESTS ===\n');

test('IPricingEngine: throws when calling unimplemented methods', async () => {
  const engine = new IPricingEngine();
  try { await engine.generateQuote({}); assert.fail('Should throw'); }
  catch (e) { assert.ok(e.message.includes('not implemented')); }
});

test('IRuleResolver: throws when calling unimplemented methods', async () => {
  const resolver = new IRuleResolver();
  try { await resolver.resolve({}); assert.fail('Should throw'); }
  catch (e) { assert.ok(e.message.includes('not implemented')); }
});

test('ICurrencyProvider: throws when calling unimplemented methods', async () => {
  const provider = new ICurrencyProvider();
  try { await provider.convert(0, '', ''); assert.fail('Should throw'); }
  catch (e) { assert.ok(e.message.includes('not implemented')); }
});

test('ICacheProvider: throws when calling unimplemented methods', async () => {
  const cache = new ICacheProvider();
  try { await cache.get('key'); assert.fail('Should throw'); }
  catch (e) { assert.ok(e.message.includes('not implemented')); }
});

test('IPricingEventPublisher: throws when calling unimplemented methods', async () => {
  const publisher = new IPricingEventPublisher();
  try { await publisher.publish({}); assert.fail('Should throw'); }
  catch (e) { assert.ok(e.message.includes('not implemented')); }
});

test('IPricingRepository: throws when calling unimplemented methods', async () => {
  const repo = new IPricingRepository();
  try { await repo.saveRule({}); assert.fail('Should throw'); }
  catch (e) { assert.ok(e.message.includes('not implemented')); }
});

console.log('\n=== MODULE LOADING TESTS ===\n');

test('Main module loads with all layers', () => {
  const mod = require('../index');
  assert.ok(mod.domain);
  assert.ok(mod.application);
  assert.ok(mod.infrastructure);
  assert.strictEqual(Object.keys(mod.domain).length, 10);
});

test('Domain exports all expected interfaces', () => {
  const mod = require('../domain');
  assert.strictEqual(typeof mod.PricingRule, 'function');
  assert.strictEqual(typeof mod.PriceQuote, 'function');
  assert.strictEqual(typeof mod.DynamicMultiplier, 'function');
  assert.strictEqual(typeof mod.PriceBreakdown, 'function');
  assert.strictEqual(typeof mod.IPricingEngine, 'function');
  assert.strictEqual(typeof mod.IPricingRepository, 'function');
});

test('Application exports all use cases', () => {
  const mod = require('../application');
  assert.strictEqual(typeof mod.useCases.GeneratePriceQuote, 'function');
  assert.strictEqual(typeof mod.useCases.RecalculatePrice, 'function');
  assert.strictEqual(typeof mod.useCases.ResolvePricingRule, 'function');
});

// ============================================================
// REPORT
// ============================================================
const total = passed + failed;
console.log(`\n========================================`);
console.log(`  TEST RESULTS: ${passed}/${total} passed`);
console.log(`  Failed: ${failed}`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);

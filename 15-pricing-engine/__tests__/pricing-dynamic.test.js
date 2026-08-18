/**
 * pricing-dynamic.test.js
 *
 * Unit tests for the dynamic pricing formula (PricingCalculator) and for the
 * PostgresPricingRuleResolver row->rule mapping (no DB required - uses a stub pool).
 *
 * Verifies: base + distance*perKm formula, traffic multiplier, night multiplier,
 * commission, cargo (barberry) config, and min/max fare clamping — all driven by
 * values that come from the pricing_configs table (never hardcoded in code).
 */

const PricingCalculator = require('../services/PricingCalculator');
const PostgresPricingRuleResolver = require('../infrastructure/repositories/PostgresPricingRuleResolver');

describe('PricingCalculator - dynamic formula', () => {
  describe('base fare + per-km (urban taxi config from DB)', () => {
    // urban_taxi seed: base_fare=15000, price_per_km=5000, price_per_min=2000
    const cfg = {
      baseFare: 15000, perKmRate: 5000, perMinuteRate: 2000,
      trafficMultiplierMin: 1.0, trafficMultiplierMax: 2.5, nightMultiplier: 1.5,
      commissionRate: 0.10, minFare: 10000, maxFare: 50000,
    };

    test('calculates base + (distance * perKm) + (duration * perMin) with no modifiers', () => {
      const r = new PricingCalculator().calculate({ ...cfg, distanceKm: 10, durationMin: 15 });
      // base = 15000 + 5000*10 + 2000*15 = 95000
      expect(r.base).toBe(95000);
      // traffic 1.0, time 1 => subtotal = 95000
      expect(r.subtotal).toBe(95000);
      // commission 10% => total 104500, but maxFare clamps to 50000
      expect(r.total).toBe(50000);
      expect(r.clampedToMax).toBe(true);
    });

    test('applies high traffic multiplier (max) when trafficLevel=1', () => {
      const r = new PricingCalculator().calculate({ ...cfg, distanceKm: 10, durationMin: 15, trafficLevel: 1 });
      expect(r.trafficFactor).toBe(2.5);
      expect(r.subtotal).toBe(95000 * 2.5);
    });

    test('applies night multiplier when isNight=true', () => {
      const r = new PricingCalculator().calculate({ ...cfg, distanceKm: 10, durationMin: 15, isNight: true });
      expect(r.timeFactor).toBe(1.5);
      expect(r.subtotal).toBe(95000 * 1.5);
    });

    test('combined: night + high traffic', () => {
      const r = new PricingCalculator().calculate({ ...cfg, distanceKm: 10, durationMin: 15, isNight: true, trafficLevel: 1 });
      // subtotal = 95000 * 2.5 * 1.5
      expect(r.subtotal).toBeCloseTo(95000 * 2.5 * 1.5, 6);
      // +10% commission => rounded/clamped by maxFare
      expect(r.total).toBe(50000);
    });
  });

  describe('cargo (باربری) config', () => {
    // cargo_light seed: base_fare=5000, price_per_km=2000, price_per_min=1000, commission 5%, max 30000
    const cfg = {
      baseFare: 5000, perKmRate: 2000, perMinuteRate: 1000,
      trafficMultiplierMin: 1.0, trafficMultiplierMax: 3.0, nightMultiplier: 1.5,
      commissionRate: 0.05, minFare: 5000, maxFare: 30000,
    };

    test('computes cargo price with commission, no heavy traffic', () => {
      const r = new PricingCalculator().calculate({ ...cfg, distanceKm: 20, durationMin: 60 });
      const base = 5000 + 2000 * 20 + 1000 * 60; // 105000 -> clamps to maxFare
      expect(r.base).toBe(105000);
      expect(r.total).toBe(30000); // clamped to maxFare
    });

    test('cargo with moderate fare stays within bounds', () => {
      const r = new PricingCalculator().calculate({ ...cfg, distanceKm: 2, durationMin: 5 });
      const base = 5000 + 2000 * 2 + 1000 * 5; // 14000
      expect(r.base).toBe(14000);
      expect(r.subtotal).toBe(14000);
      expect(r.total).toBeCloseTo(14000 * 1.05, 6); // +5% commission
    });
  });

  describe('commission & clamping', () => {
    test('applies commission rate to subtotal', () => {
      const r = new PricingCalculator().calculate({
        baseFare: 1000, perKmRate: 100, perMinuteRate: 0,
        trafficMultiplierMin: 1, trafficMultiplierMax: 1, nightMultiplier: 1,
        commissionRate: 0.10, minFare: 0, maxFare: 0,
        distanceKm: 10, durationMin: 0,
      });
      // base = 1000 + 100*10 = 2000; commission 10% => 2200
      expect(r.base).toBe(2000);
      expect(r.total).toBe(2200);
    });

    test('minFare clamps a very low total upward', () => {
      const r = new PricingCalculator().calculate({
        baseFare: 1000, perKmRate: 0, perMinuteRate: 0,
        trafficMultiplierMin: 1, trafficMultiplierMax: 1, nightMultiplier: 1,
        commissionRate: 0, minFare: 5000, maxFare: 0,
        distanceKm: 0, durationMin: 0,
      });
      expect(r.total).toBe(5000);
      expect(r.clampedToMin).toBe(true);
    });
  });
});

describe('PostgresPricingRuleResolver - row -> rule mapping', () => {
  // Stub dbPool so that no real DB connection is needed; only tests _rowToRule.
  const resolver = Object.create(PostgresPricingRuleResolver.prototype);
  resolver._cache = new Map();

  test('maps a pricing_configs row into a PricingRule entity', () => {
    const row = {
      id: 'uuid-1', service_type: 'urban_taxi', base_fare: '15000',
      price_per_km: '5000', price_per_min: '2000',
    };
    const rule = resolver._rowToRule(row);
    expect(rule).toBeInstanceOf(require('../domain').PricingRule);
    expect(rule.baseFare).toBe(15000);
    expect(rule.perKmRate).toBe(5000);
    expect(rule.perMinuteRate).toBe(2000);
    expect(rule.calculateBasePrice(10, 15)).toBe(15000 + 5000 * 10 + 2000 * 15);
  });

  test('coerces non-numeric values to 0 (never NaN)', () => {
    const row = { id: 'x', service_type: 'urban_taxi', base_fare: null, price_per_km: 'abc', price_per_min: undefined };
    const rule = resolver._rowToRule(row);
    expect(rule.baseFare).toBe(0);
    expect(rule.perKmRate).toBe(0);
    expect(rule.perMinuteRate).toBe(0);
  });
});
/**
 * pricing-dynamic.test.js
 *
 * Unit tests for the DYNAMIC pricing formula (domain/PricingCalculator) and for
 * the PostgresPricingRuleResolver row -> rule mapping (no DB required - uses a
 * prototype-only resolver instance and direct `_rowToRule` calls).
 *
 * Verifies: base + distance*perKm + duration*perMin formula, traffic multiplier,
 * minimum-fare clamping and the commission/provider split - all driven by values
 * that come from the `pricing_configs` table (never hardcoded in code).
 */

const PricingCalculator = require('../domain/PricingCalculator');
const PostgresPricingRuleResolver = require('../infrastructure/repositories/PostgresPricingRuleResolver');
const { PricingRule } = require('../domain');

/**
 * A `pricing_configs` row shaped exactly as PricingRepository.getActiveConfig()
 * hands it to the domain layer:
 *   price_per_min -> price_per_minute, min_fare -> minimum_fare and
 *   commission_rate already converted from percent (10) to a factor (0.10).
 * Defaults below mirror the `Taxi Urban` seed row.
 */
function makeConfig(overrides = {}) {
  return {
    id: 'cfg-urban-taxi',
    base_fare: 15000,
    price_per_km: 5000,
    price_per_minute: 2000,
    minimum_fare: 10000,
    commission_rate: 0.10,
    ...overrides,
  };
}

describe('PricingCalculator - dynamic formula', () => {
  describe('base + per-km + per-minute (urban_taxi seed from pricing_configs)', () => {
    test('calculates base + (distance * perKm) + (duration * perMin) with no modifiers', () => {
      const r = PricingCalculator.calculateQuote(makeConfig(), 10, 15, 1.0);
      // 15000 + 5000*10 + 2000*15 = 95000
      expect(r.amounts.gross.toDisplayFormat()).toBe('95000');
      expect(r.calculationSteps.baseFare).toBe('15000');
      expect(r.calculationSteps.distanceCost).toBe('50000');
      expect(r.calculationSteps.timeCost).toBe('30000');
    });

    test('traffic multiplier (max 2.5 from pricing_configs) scales the gross amount', () => {
      const r = PricingCalculator.calculateQuote(makeConfig(), 10, 15, 2.5);
      expect(r.amounts.gross.toDisplayFormat()).toBe('237500'); // 95000 * 2.5
      expect(r.calculationSteps.trafficMultiplier).toBe(2.5);
    });
  });

  describe('minimum fare clamp (min_fare from pricing_configs)', () => {
    test('clamps a very low computed amount up to minimum_fare', () => {
      const cfg = makeConfig({
        base_fare: 1000, price_per_km: 0, price_per_minute: 0, minimum_fare: 5000,
      });
      const r = PricingCalculator.calculateQuote(cfg, 0, 0, 1.0);
      expect(r.amounts.gross.toDisplayFormat()).toBe('5000');
      expect(r.calculationSteps.appliedMinimumFare).toBe(true);
    });

    test('does not clamp when the computed amount is above minimum_fare', () => {
      const r = PricingCalculator.calculateQuote(makeConfig(), 10, 15, 1.0);
      expect(r.amounts.gross.toDisplayFormat()).toBe('95000');
      expect(r.calculationSteps.appliedMinimumFare).toBe(false);
    });
  });

  describe('commission split (commission_rate from pricing_configs)', () => {
    test('applies the configured commission and leaves the remainder to the provider', () => {
      const r = PricingCalculator.calculateQuote(makeConfig(), 10, 15, 1.0);
      expect(r.amounts.commission.toDisplayFormat()).toBe('9500'); // 95000 * 0.10
      expect(r.amounts.provider.toDisplayFormat()).toBe('85500');
      // Provider share + platform commission must exactly equal the gross amount.
      const reconstructed = r.amounts.provider.add(r.amounts.commission);
      expect(reconstructed.toDisplayFormat()).toBe(r.amounts.gross.toDisplayFormat());
    });

    test('cargo_light seed (5% commission, base 5000 / perKm 2000 / perMin 1000)', () => {
      const cfg = makeConfig({
        base_fare: 5000, price_per_km: 2000, price_per_minute: 1000,
        minimum_fare: 5000, commission_rate: 0.05,
      });
      const r = PricingCalculator.calculateQuote(cfg, 2, 5, 1.0);
      expect(r.amounts.gross.toDisplayFormat()).toBe('14000');    // 5000 + 4000 + 5000
      expect(r.amounts.commission.toDisplayFormat()).toBe('700'); // 14000 * 0.05
      expect(r.amounts.provider.toDisplayFormat()).toBe('13300');
    });
  });
});

describe('PostgresPricingRuleResolver - row -> rule mapping', () => {
  // Prototype-only instance so that no real DB connection/pool is created;
  // the mapping helpers under test never touch the network.
  const resolver = Object.create(PostgresPricingRuleResolver.prototype);
  resolver._cache = new Map();

  test('maps a pricing_configs row into a PricingRule entity', () => {
    const row = {
      id: 'uuid-1', service_type: 'urban_taxi', base_fare: '15000',
      price_per_km: '5000', price_per_min: '2000',
    };
    const rule = resolver._rowToRule(row);
    expect(rule).toBeInstanceOf(PricingRule);
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

  test('maps the dynamic multipliers, percent commission and fare bounds from the DB row', () => {
    const rule = resolver._rowToRule({
      id: 'uuid-2', service_type: 'urban_taxi', base_fare: '15000',
      price_per_km: '5000', price_per_min: '2000',
      traffic_multiplier_min: '1.0', traffic_multiplier_max: '2.5',
      night_multiplier: '1.5', commission_rate: '10',
      min_fare: '10000', max_fare: '50000',
    });

    expect(rule.trafficMultiplierMin).toBe(1.0);
    expect(rule.trafficMultiplierMax).toBe(2.5);
    expect(rule.nightMultiplier).toBe(1.5);
    // DB stores commission as a percentage (10) -> exposed as a 0..1 factor.
    expect(rule.commissionRate).toBe(0.10);
    expect(rule.minFare).toBe(10000);
    expect(rule.maxFare).toBe(50000);
  });

  test('falls back to safe multiplier defaults when the optional columns are absent', () => {
    const rule = resolver._rowToRule({
      id: 'uuid-3', service_type: 'cargo_light', base_fare: '5000',
      price_per_km: '2000', price_per_min: '1000',
    });

    expect(rule.trafficMultiplierMin).toBe(1);
    expect(rule.trafficMultiplierMax).toBe(1); // mirrors the minimum, never wider
    expect(rule.nightMultiplier).toBe(1);
    expect(rule.commissionRate).toBe(0);
    expect(rule.minFare).toBe(0);
    expect(rule.maxFare).toBe(0);
  });
});

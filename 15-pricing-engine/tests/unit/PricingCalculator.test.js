/**
 * unit/PricingCalculator.test.js
 *
 * Unit tests for the PricingCalculator domain service.
 * Verifies the base fare formula, the minimum-fare rule, and exact
 * commission/provider split using decimal.js precision.
 */

const { Decimal } = require('decimal.js');

const PricingCalculator = require('../../domain/PricingCalculator');

// A representative urban_taxi configuration (values mirror DB seed data).
function makeConfig(overrides = {}) {
  return {
    base_fare: 15000,
    price_per_km: 5000,
    price_per_minute: 2000,
    minimum_fare: 30000,
    commission_rate: 0.10, // fractional factor expected by the calculator
    ...overrides,
  };
}

describe('PricingCalculator (domain service)', () => {
  describe('base fare formula: (Base + Dist*PerKm + Dur*PerMin) * Traffic', () => {
    test('computes the exact gross amount for a normal trip', () => {
      const config = makeConfig();
      const result = PricingCalculator.calculateQuote(config, 10, 15, 1.0);

      // base 15000 + (10*5000=50000) + (15*2000=30000) = 95000 ; *1.0 = 95000
      expect(result.amounts.gross.toDatabaseFormat()).toBe('95000');
      expect(result.amounts.gross.toDisplayFormat()).toBe('95000');
    });

    test('applies traffic multiplier to the subtotal', () => {
      const config = makeConfig();
      const result = PricingCalculator.calculateQuote(config, 10, 15, 1.5);

      // 95000 * 1.5 = 142500
      expect(result.amounts.gross.toDatabaseFormat()).toBe('142500');
    });

    test('traffic multiplier is optional (defaults to 1.0)', () => {
      const config = makeConfig();
      const result = PricingCalculator.calculateQuote(config, 10, 15);
      expect(result.amounts.gross.toDisplayFormat()).toBe('95000');
    });

    test('distance cost uses price_per_km and duration uses price_per_minute', () => {
      const config = makeConfig();
      const result = PricingCalculator.calculateQuote(config, 10, 15, 1.0);
      expect(result.calculationSteps.baseFare).toBe('15000');
      expect(result.calculationSteps.distanceCost).toBe('50000'); // 10*5000
      expect(result.calculationSteps.timeCost).toBe('30000');     // 15*2000
    });
  });

  describe('minimum fare rule', () => {
    test('returns exact minimum_fare when computed amount is lower', () => {
      const config = makeConfig({ minimum_fare: 40000 });
      // calculated: base 5000 + (1*2000) + (1*500) = 7500 (< 40000)
      const cfg = { ...config, base_fare: 5000, price_per_km: 2000, price_per_minute: 500 };
      const result = PricingCalculator.calculateQuote(cfg, 1, 1, 1.0);

      expect(result.amounts.gross.toDisplayFormat()).toBe('40000');
      expect(result.calculationSteps.appliedMinimumFare).toBe(true);
    });

    test('does NOT apply minimum fare when computed amount is above it', () => {
      const config = makeConfig({ minimum_fare: 30000 });
      const result = PricingCalculator.calculateQuote(config, 10, 15, 1.0); // 95000
      expect(result.amounts.gross.toDisplayFormat()).toBe('95000');
      expect(result.calculationSteps.appliedMinimumFare).toBe(false);
    });

    test('computes commission/provider off the minimum fare when applied', () => {
      const config = { base_fare: 1000, price_per_km: 1000, price_per_minute: 1000, minimum_fare: 10000, commission_rate: 0.10 };
      const result = PricingCalculator.calculateQuote(config, 1, 1, 1.0);
      // calculated = 3000 < min 10000 -> gross = 10000
      expect(result.amounts.gross.toDisplayFormat()).toBe('10000');
      // commission = 10000 * 0.10 = 1000
      expect(result.amounts.commission.toDisplayFormat()).toBe('1000');
      // provider = 10000 - 1000 = 9000
      expect(result.amounts.provider.toDisplayFormat()).toBe('9000');
    });
  });

  describe('commission calculation (exact decimal)', () => {
    test('10% platform share and 90% driver share', () => {
      const config = makeConfig({ commission_rate: 0.10 });
      const result = PricingCalculator.calculateQuote(config, 10, 15, 1.0); // gross 95000

      // commission = 95000 * 0.10 = 9500
      expect(result.amounts.commission.toDisplayFormat()).toBe('9500');
      // provider = 95000 - 9500 = 85500
      expect(result.amounts.provider.toDisplayFormat()).toBe('85500');
      // provider + commission must exactly equal gross (no rounding drift)
      const check = result.amounts.provider.add(result.amounts.commission);
      expect(check.toDisplayFormat()).toBe(result.amounts.gross.toDisplayFormat());
    });

    test('commission with a fractional rate (e.g. 7.5%)', () => {
      const config = makeConfig({ commission_rate: 0.075 });
      const result = PricingCalculator.calculateQuote(config, 10, 15, 1.0);
      // 95000 * 0.075 = 7125
      expect(result.amounts.commission.toDisplayFormat()).toBe('7125');
      // provider = 95000 - 7125 = 87875
      expect(result.amounts.provider.toDisplayFormat()).toBe('87875');
    });

    test('customer final amount equals gross (no discount/tax)', () => {
      const config = makeConfig();
      const result = PricingCalculator.calculateQuote(config, 10, 15, 1.0);
      expect(result.amounts.customerFinal.toDisplayFormat()).toBe('95000');
      expect(result.amounts.discount.toDisplayFormat()).toBe('0');
      expect(result.amounts.tax.toDisplayFormat()).toBe('0');
    });
  });
});
/**
 * PricingCalculator - Service that applies the dynamic pricing formula.
 *
 * IMPORTANT (Enterprise / Financial correctness):
 *   ALL financial arithmetic (base fare + distance*rate, traffic factor,
 *   night factor, commission) is performed with `decimal.js` — a precise
 *   arbitrary-precision decimal library — to avoid IEEE-754 floating-point
 *   rounding errors. Monetary/factor outputs are returned as DECIMAL STRINGS
 *   so no precision is lost through JSON Number serialization.
 *
 * Inputs come from the pricing_configs table (via PostgresPricingRuleResolver)
 * at runtime; no pricing coefficient is hardcoded in this file.
 *
 * Formula:
 *   base      = baseFare + (perKmRate * distanceKm) + (perMinuteRate * durationMin)
 *   traffic   = trafficMultiplierMin + (trafficMultiplierMax - trafficMultiplierMin) * trafficLevel (0..1)
 *   timeFactor= nightMultiplier when isNight, else 1
 *   subtotal  = base * traffic * timeFactor
 *   commission= subtotal * commissionRate  (0..1)
 *   total     = subtotal + commission, clamped to [minFare, maxFare] when bounds > 0
 */

const { Decimal } = require('decimal.js');

const zero = () => new Decimal(0);
const one = () => new Decimal(1);

const toDecimal = (v) => {
  if (v === undefined || v === null || v === '') return zero();
  return new Decimal(v);
};

class PricingCalculator {
  /**
   * @param {Object} params - numeric values (from DB); may be number|string
   * @returns {Object} breakdown with decimal-string monetary fields
   */
  calculate({
    baseFare = 0,
    perKmRate = 0,
    perMinuteRate = 0,
    trafficMultiplierMin = 1,
    trafficMultiplierMax = 1,
    nightMultiplier = 1,
    commissionRate = 0,
    minFare = 0,
    maxFare = 0,
    distanceKm = 0,
    durationMin = 0,
    trafficLevel = 0,
    isNight = false,
  } = {}) {
    // Coerce every input to Decimal
    const dBaseFare = toDecimal(baseFare);
    const dPerKm = toDecimal(perKmRate);
    const dPerMin = toDecimal(perMinuteRate);
    const dTrafficMin = toDecimal(trafficMultiplierMin);
    const dTrafficMax = toDecimal(trafficMultiplierMax);
    const dNight = toDecimal(nightMultiplier);
    const dCommissionRate = toDecimal(commissionRate);
    const dMinFare = toDecimal(minFare);
    const dMaxFare = toDecimal(maxFare);
    const dDistance = toDecimal(distanceKm);
    const dDuration = toDecimal(durationMin);
    const dTrafficLevel = toDecimal(trafficLevel).clamp(zero(), one());

    // base = baseFare + perKmRate*distance + perMinuteRate*duration  (all Decimal)
    const base = dBaseFare.plus(dPerKm.mul(dDistance)).plus(dPerMin.mul(dDuration));

    // traffic = min + (max - min) * trafficLevel   (Decimal)
    const trafficFactor = dTrafficMin.plus(dTrafficMax.minus(dTrafficMin).mul(dTrafficLevel));

    // timeFactor = nightMultiplier when isNight, else 1
    const timeFactor = isNight ? dNight : one();

    // subtotal = base * trafficFactor * timeFactor (Decimal)
    const subtotal = base.mul(trafficFactor).mul(timeFactor);

    // commission = subtotal * commissionRate (Decimal)
    const commission = subtotal.mul(dCommissionRate);

    // total = subtotal + commission, clamped to [min, max] when bounds > 0
    let total = subtotal.plus(commission);
    const hasMax = dMaxFare.gt(zero());
    const hasMin = dMinFare.gt(zero());
    if (hasMax) total = Decimal.min(total, dMaxFare);
    if (hasMin) total = Decimal.max(total, dMinFare);

    return {
      base: base.toString(),
      trafficFactor: trafficFactor.toString(),
      timeFactor: timeFactor.toString(),
      subtotal: subtotal.toString(),
      commissionRate: dCommissionRate.toString(),
      commission: commission.toString(),
      total: total.toString(),
      clampedToMax: hasMax && total.gte(dMaxFare),
      clampedToMin: hasMin && total.lte(dMinFare),
    };
  }

  /**
   * Convenience: return monetary fields as Numbers (for non-financial display only;
   * persistence/audit should use the string form). Use with caution.
   */
  calculateAsNumber(params) {
    const r = this.calculate(params);
    return {
      ...r,
      base: Number(r.base),
      trafficFactor: Number(r.trafficFactor),
      timeFactor: Number(r.timeFactor),
      subtotal: Number(r.subtotal),
      commission: Number(r.commission),
      total: Number(r.total),
    };
  }
}

module.exports = PricingCalculator;
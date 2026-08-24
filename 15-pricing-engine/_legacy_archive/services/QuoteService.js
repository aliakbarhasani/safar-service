/**
 * QuoteService - persists calculated price quotes and their audit snapshot.
 *
 * Flow:
 *  1. Resolve the dynamic pricing config (from pricing_configs via PostgresPricingRuleResolver).
 *  2. Compute the price with PricingCalculator (decimal.js - precise financial math).
 *  3. Store the quote in `quotes` and a coefficient snapshot in `pricing_audit_logs`.
 *  4. Return quote_id (+ amounts) to the client, so prices are never "computed and dropped".
 *
 * Idempotency: when a referenceId is supplied, an existing quote with the same
 * reference_id is returned instead of creating a duplicate.
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const { Decimal } = require('decimal.js');
const config = require('../../../14-config-system/server.config');
const PricingCalculator = require('./PricingCalculator');
const { PostgresPricingRuleResolver } = require('../../infrastructure');

const toFixed = (v) => new Decimal(v).toFixed(2);

class QuoteService {
  constructor({ pool = null, resolver = null, calculator = null } = {}) {
    this.pool = pool || new Pool({
      host: config.pg.host,
      port: config.pg.port,
      database: config.pg.database,
      user: config.pg.user,
      password: config.pg.password,
      max: config.pg.max || 10,
      idleTimeoutMillis: config.pg.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.pg.connectionTimeoutMillis || 5000,
    });
    this.resolver = resolver || new PostgresPricingRuleResolver();
    this.calculator = calculator || new PricingCalculator();
  }

  /**
   * @param {Object} input
   * @param {string} input.serviceType
   * @param {number} input.distanceKm
   * @param {number} input.durationMin
   * @param {number} [input.trafficLevel] - 0..1
   * @param {boolean} [input.isNight]
   * @param {string} [input.referenceId] - idempotency key
   * @param {string} [input.tripRequestId]
   * @param {string} [input.currencyId='IRT']
   * @returns {Promise<Object>} { quoteId, status, grossAmount, finalAmount, expiresAt, breakdown }
   */
  async createQuote(input) {
    const {
      serviceType, distanceKm, durationMin,
      trafficLevel = 0, isNight = false,
      referenceId = null, tripRequestId = null,
      currencyId = 'IRT', expiresInMinutes = 5,
    } = input;

    if (!serviceType || distanceKm === undefined || durationMin === undefined) {
      throw new Error('serviceType, distanceKm, and durationMin are required');
    }

    // 1) Idempotency fast-path
    if (referenceId) {
      const existing = await this._findByReference(referenceId);
      if (existing) return existing;
    }

    // 2) Resolve dynamic config from DB
    const rule = await this.resolver.resolve({ scopeType: 'City', scopeId: 'default', serviceType });
    if (!rule) {
      throw new Error(`No active pricing rule for service '${serviceType}'`);
    }

    // 3) Precise decimal calculation
    const calc = this.calculator.calculate({
      baseFare: rule.baseFare,
      perKmRate: rule.perKmRate,
      perMinuteRate: rule.perMinuteRate,
      trafficMultiplierMin: rule.trafficMultiplierMin,
      trafficMultiplierMax: rule.trafficMultiplierMax,
      nightMultiplier: rule.nightMultiplier,
      commissionRate: rule.commissionRate,
      minFare: rule.minFare,
      maxFare: rule.maxFare,
      distanceKm,
      durationMin,
      trafficLevel,
      isNight: Boolean(isNight),
    });

    const grossAmount = toFixed(calc.subtotal);       // subtotal after multipliers, before commission
    const finalAmount = toFixed(calc.total);          // final payable (incl. commission, clamped)
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const quoteId = crypto.randomUUID();

    const payload = {
      serviceType, distanceKm, durationMin, trafficLevel, isNight: Boolean(isNight),
      currencyId, tripRequestId,
      rule: rule.snapshot ? rule.snapshot() : rule,
      calculator: calc,
    };
// 4) Persist quote + audit snapshot
    try {
      await this.pool.query(
        `INSERT INTO quotes (id, reference_id, trip_request_id, service_type, currency_id,
           gross_amount, final_amount, status, expires_at, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'CREATED',$8,$9::jsonb)`,
        [quoteId, referenceId, tripRequestId || null, serviceType, currencyId,
         grossAmount, finalAmount, expiresAt, JSON.stringify(payload)]
      );

      await this.pool.query(
        `INSERT INTO pricing_audit_logs
           (quote_id, service_type, rule_id, base_fare, per_km_rate, per_minute_rate,
            traffic_multiplier_min, traffic_multiplier_max, night_multiplier, commission_rate,
            applied_traffic_factor, applied_time_factor, gross_amount, final_amount, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
        [quoteId, serviceType, rule.id || null,
         toFixed(rule.baseFare), toFixed(rule.perKmRate), toFixed(rule.perMinuteRate),
         new Decimal(rule.trafficMultiplierMin).toFixed(6), new Decimal(rule.trafficMultiplierMax).toFixed(6),
         new Decimal(rule.nightMultiplier).toFixed(6), new Decimal(rule.commissionRate).toFixed(6),
         new Decimal(calc.trafficFactor).toFixed(6), new Decimal(calc.timeFactor).toFixed(6),
         grossAmount, finalAmount, JSON.stringify(payload)]
      );
    } catch (error) {
      console.error('[QuoteService] persistence error:', error.message);
      throw error;
    }

    return {
      quoteId,
      referenceId: referenceId || null,
      status: 'CREATED',
      grossAmount,
      finalAmount,
      currencyId,
      expiresAt: expiresAt.toISOString(),
      breakdown: calc,
    };
  }

  async _findByReference(referenceId) {
    if (!this.pool) return null;
    try {
      const res = await this.pool.query(
        'SELECT id, gross_amount, final_amount, status, expires_at FROM quotes WHERE reference_id = $1 LIMIT 1',
        [referenceId]
      );
      if (res.rows && res.rows[0]) {
        const r = res.rows[0];
        return {
          quoteId: r.id,
          referenceId,
          status: r.status,
          grossAmount: String(r.gross_amount),
          finalAmount: String(r.final_amount),
          expiresAt: new Date(r.expires_at).toISOString(),
          idempotent: true,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}

module.exports = QuoteService;
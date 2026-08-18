/**
 * PostgresPricingRuleResolver
 *
 * Concrete IRuleResolver implementation that reads pricing settings dynamically
 * from the `pricing_configs` table and builds a PricingRule domain entity.
 *
 * No pricing amounts are hardcoded here - all numeric parameters
 * (base fare, price per km, price per minute) are loaded from the database.
 */

const { Pool } = require('pg');
const config = require('../../../14-config-system/server.config');
const { PricingRule } = require('../../domain');

class PostgresPricingRuleResolver {
  constructor() {
    this._cache = new Map();
    this._initPool();
  }

  _initPool() {
    try {
      this.pool = new Pool({
        host: config.pg.host,
        port: config.pg.port,
        database: config.pg.database,
        user: config.pg.user,
        password: config.pg.password,
        max: config.pg.max || 10,
        idleTimeoutMillis: config.pg.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.pg.connectionTimeoutMillis || 5000,
      });
    } catch (err) {
      console.warn('[PostgresPricingRuleResolver] pool init failed:', err.message);
      this.pool = null;
    }
  }

  async _isDbReady() {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve the applicable pricing rule for a context, reading from pricing_configs.
   * Falls back to the service-specific config, or to the global default config.
   *
   * @param {Object} context - { scopeType, scopeId, serviceType }
   * @returns {Promise<PricingRule|null>}
   */
  async resolve(context) {
    const { scopeType, scopeId, serviceType } = context;
    if (!scopeType || !scopeId || !serviceType) {
      throw new Error('scopeType, scopeId, and serviceType are all required');
    }

    const cacheKey = `rule:${serviceType}:${scopeType}:${scopeId}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    if (!(await this._isDbReady())) {
      return null;
    }

    try {
      // 1) Prefer an active, service-specific config
      let result = await this.pool.query(
        'SELECT * FROM pricing_configs WHERE service_type = $1 AND status = $2 LIMIT 1',
        [serviceType, 'active']
      );

      // 2) Fall back to the active default config
      if (!result.rows || result.rows.length === 0) {
        result = await this.pool.query(
          'SELECT * FROM pricing_configs WHERE is_default = true AND status = $2 LIMIT 1',
          [serviceType, 'active']
        ).catch(() => this.pool.query('SELECT * FROM pricing_configs WHERE is_default = true AND status = $1 LIMIT 1', ['active']));
      }

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const rule = this._rowToRule(result.rows[0]);
      this._cache.set(cacheKey, rule);
      return rule;
    } catch (error) {
      console.warn('[PostgresPricingRuleResolver] query error:', error.message);
      return null;
    }
  }

  /**
   * Convert a pricing_configs row into a PricingRule domain entity.
   * @private
   */
  _rowToRule(row) {
    const baseFare = Number(row.base_fare);
    const perKmRate = Number(row.price_per_km);
    const perMinuteRate = Number(row.price_per_min);

    const rule = new PricingRule({
      id: row.id,
      priority: 50,
      scopeType: 'Global',
      scopeId: 'default',
      serviceType: row.service_type || 'urban_taxi',
      currencyId: 'IRT',
      baseFare: Number.isFinite(baseFare) ? baseFare : 0,
      perKmRate: Number.isFinite(perKmRate) ? perKmRate : 0,
      perMinuteRate: Number.isFinite(perMinuteRate) ? perMinuteRate : 0,
    });

    // ضریب کامل از جدول pricing_configs (که PricingRule هسته ندارد) مرتبط می‌شود.
    // مقادیر به‌صورت داینامیک از DB می‌آیند؛ هیچ عددی در کد hardcode نیست.
    rule.trafficMultiplierMin = Number.isFinite(Number(row.traffic_multiplier_min)) ? Number(row.traffic_multiplier_min) : 1;
    rule.trafficMultiplierMax = Number.isFinite(Number(row.traffic_multiplier_max)) ? Number(row.traffic_multiplier_max) : rule.trafficMultiplierMin;
    rule.nightMultiplier = Number.isFinite(Number(row.night_multiplier)) ? Number(row.night_multiplier) : 1;
    // commission_rate در DB درصد است (مثلاً 10)؛ اینجا به ضریب 0..1 تبدیل می‌شود
    const cRate = Number(row.commission_rate);
    rule.commissionRate = Number.isFinite(cRate) ? cRate / 100 : 0;
    rule.minFare = Number.isFinite(Number(row.min_fare)) ? Number(row.min_fare) : 0;
    rule.maxFare = Number.isFinite(Number(row.max_fare)) ? Number(row.max_fare) : 0;

    return rule;
  }

  /**
   * Get all active rules as PricingRule entities.
   * @returns {Promise<Array<PricingRule>>}
   */
  async getActiveRules(scopeType, scopeId, serviceType) {
    if (!(await this._isDbReady())) return [];
    try {
      const result = await this.pool.query(
        'SELECT * FROM pricing_configs WHERE status = $1 ORDER BY is_default DESC',
        ['active']
      );
      return (result.rows || []).map((row) => this._rowToRule(row));
    } catch (error) {
      console.warn('[PostgresPricingRuleResolver] getActiveRules error:', error.message);
      return [];
    }
  }

  /**
   * Invalidate the cache for a context.
   */
  async invalidateCache(scopeType, scopeId, serviceType) {
    this._cache.delete(`rule:${serviceType}:${scopeType}:${scopeId}`);
  }
}

module.exports = PostgresPricingRuleResolver;

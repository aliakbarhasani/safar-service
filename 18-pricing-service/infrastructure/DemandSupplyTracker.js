/**
 * DemandSupplyTracker.js - Supply & Demand Tracker (Infrastructure, P6-1)
 *
 * Records per-region demand in Redis (keyed by a 5-char geohash ≈ 5×5 km) and
 * reads the current supply so the fare calculator can derive a surge ratio.
 *
 * Redis keys:
 *   demand:<geohash>:15min   — INCR counter with a 15-minute TTL
 *   supply:<geohash>         — free-driver count for the region (optional)
 *
 * Dependency-injected Redis client so tests can pass a mock/fake without a
 * live Redis. If `ioredis` is not available, the injected no-op client makes
 * every read return 0 (surge degrades to 1.0).
 */

const ngeohash = require('ngeohash');

const GEOHASH_PRECISION = 5; // ≈ 5×5 km cells
const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes
const DEFAULT_SUPPLY = 3; // fallback free-driver count when nothing stored

class DemandSupplyTracker {
  /**
   * @param {Object} redisClient - ioredis-compatible client (or no-op / mock)
   * @param {Object} [opts]
   * @param {number} [opts.precision]
   * @param {number} [opts.ttlSeconds]
   * @param {string} [opts.keyPrefix='demand']
   * @param {number} [opts.defaultSupply]
   */
  constructor(redisClient, {
    precision = GEOHASH_PRECISION,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    keyPrefix = 'demand',
    defaultSupply = DEFAULT_SUPPLY,
  } = {}) {
    if (!redisClient) throw new Error('DemandSupplyTracker: redisClient is required');
    this.redis = redisClient;
    this.precision = precision;
    this.ttlSeconds = ttlSeconds;
    this.keyPrefix = keyPrefix;
    this.defaultSupply = defaultSupply;
  }

  /** Encode lat/lng into a geohash at given precision. */
  encodeGeohash(lat, lng) {
    return ngeohash.encode(lat, lng, this.precision);
  }

  /** Redis key for demand in a region's current 15-min window. */
  _demandKey(geohash) {
    return `${this.keyPrefix}:${geohash}:15min`;
  }

  _supplyKey(geohash) {
    return `supply:${geohash}`;
  }

  /**
   * Increment regional demand for the 15-minute window (INCR + TTL).
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<{ geohash: string, demand: number }>}
   */
  async recordDemand(lat, lng) {
    const geohash = this.encodeGeohash(lat, lng);
    const key = this._demandKey(geohash);
    const demand = Number(await this.redis.incr(key)) || 0;
    // Only set TTL when we opened the window (first increment in it).
    if (demand === 1) {
      await this.redis.expire(key, this.ttlSeconds);
    }
    return { geohash, demand };
  }

  /** Register the free-driver count for a region (sets a TTL too). */
  async setSupply(latOrGeohash, lngOrCount, maybeCount) {
    let geohash;
    let count;
    if (typeof lngOrCount === 'number') {
      geohash = this.encodeGeohash(latOrGeohash, lngOrCount);
      count = maybeCount;
    } else {
      geohash = latOrGeohash;
      count = lngOrCount;
    }
    await this.redis.set(this._supplyKey(geohash), String(count || 0), 'EX', this.ttlSeconds);
    return { geohash, supply: count || 0 };
  }

  /** Current demand count for a geohash. */
  async getDemand(geohash) {
    const val = await this.redis.get(this._demandKey(geohash));
    return val ? parseInt(val, 10) : 0;
  }

  /** Current supply (free drivers) for a geohash. */
  async getSupply(geohash) {
    const val = await this.redis.get(this._supplyKey(geohash));
    return val ? parseInt(val, 10) : 0;
  }

  /**
   * Combined supply/demand for a region.
   * Demand comes from the live counter; supply falls back to the configured
   * default. Ratio = demand / supply (ratio > 1 when demand exceeds supply).
   * @param {string} geohash
   * @param {Object} [opts]
   * @param {number} [opts.supply] - explicit supply override (tests)
   * @returns {Promise<{ geohash, demand:number, supply:number, ratio:number }>}
   */
  async getSupplyAndDemand(geohash, { supply = null } = {}) {
    const demand = await this.getDemand(geohash);
    const storedSupply = await this.getSupply(geohash);
    const supplyValue = (supply != null) ? supply : (storedSupply || this.defaultSupply || 0);
    const ratio = supplyValue > 0 ? demand / supplyValue : 0;
    return { geohash, demand, supply: supplyValue, ratio };
  }
}

module.exports = { DemandSupplyTracker, GEOHASH_PRECISION, DEFAULT_TTL_SECONDS, DEFAULT_SUPPLY };
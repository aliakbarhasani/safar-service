/**
 * CalculateFareUseCase.js - Application Layer (Pricing Service, P6-1)
 *
 * Computes an estimated fare for a passenger before the trip is requested:
 *
 *   base_price = (distanceKm × perKmRate) + baseFare
 *   surge      = 1.0 when demand ≤ supply, else clamp(ratio, 1.1, MAX_SURGE)
 *   final      = round(base_price × surge)
 *
 * The demand/surge ratio is read from the Supply & Demand tracker via the
 * origin region's geohash (precision 5 ≈ 5×5 km). Returns
 * { estimatedFare, distance, surgeMultiplier }.
 */

const ngeohash = require('ngeohash');
const config = require('../../14-config-system/server.config');

const GEOHASH_PRECISION = 5;
const MAX_SURGE = 2.0;
const SURGE_FLOOR = 1.1;

/** Haversine distance in kilometres between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Round to 2 decimals. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Surge multiplier from a demand/supply ratio.
 * ratio ≤ 1  -> 1.0 (no surge)
 * ratio > 1  -> clamp(ratio, 1.1, MAX_SURGE)
 */
function computeSurge(ratio) {
  const r = Number(ratio) || 0;
  if (!(r > 1)) return 1.0;
  return round2(Math.min(Math.max(r, SURGE_FLOOR), MAX_SURGE));
}

class CalculateFareUseCase {
  /**
   * @param {Object} deps
   * @param {import('../infrastructure/DemandSupplyTracker').DemandSupplyTracker} deps.demandSupplyTracker
   */
  constructor({ demandSupplyTracker }) {
    if (!demandSupplyTracker) {
      throw new Error('CalculateFareUseCase: demandSupplyTracker is required');
    }
    this.tracker = demandSupplyTracker;
  }

  /**
   * @param {Object} input
   * @param {number} input.originLat
   * @param {number} input.originLng
   * @param {number} input.destLat
   * @param {number} input.destLng
   * @param {number} [input.perKmRate] - override config per-km rate
   * @param {number} [input.baseFare] - override config base fare
   * @param {number} [input.supply] - optional explicit supply (tests)
   * @returns {Promise<{ estimatedFare:number, distance:number, surgeMultiplier:number, geohash:string }>}
   */
  async execute({ originLat, originLng, destLat, destLng, perKmRate = null, baseFare = null, supply = null }) {
    const oLat = Number(originLat);
    const oLng = Number(originLng);
    const dLat = Number(destLat);
    const dLng = Number(destLng);

    if ([oLat, oLng, dLat, dLng].some((v) => !Number.isFinite(v))) {
      const err = new Error('مختصات مبدأ و مقصد باید عددی معتبر باشند.');
      err.code = 'FARE_INVALID_COORDS';
      err.statusCode = 400;
      throw err;
    }
    if (oLng < -180 || oLng > 180 || dLng < -180 || dLng > 180) {
      const err = new Error('طول جغرافیایی باید بین -180 و 180 باشد.');
      err.code = 'FARE_INVALID_COORDS';
      err.statusCode = 400;
      throw err;
    }
    if (oLat < -90 || oLat > 90 || dLat < -90 || dLat > 90) {
      const err = new Error('عرض جغرافیایی باید بین -90 و 90 باشد.');
      err.code = 'FARE_INVALID_COORDS';
      err.statusCode = 400;
      throw err;
    }

    const distance = round2(haversineKm(oLat, oLng, dLat, dLng));
    const rate = perKmRate != null ? Number(perKmRate) : parseFloat((config.trip || {}).perKmRate) || 2000;
    const base = baseFare != null ? Number(baseFare) : parseFloat((config.trip || {}).baseFare) || 0;

    const geohash = ngeohash.encode(oLat, oLng, GEOHASH_PRECISION);
    const { ratio } = await this.tracker.getSupplyAndDemand(geohash, { supply });
    const surgeMultiplier = computeSurge(ratio);

    const basePrice = distance * rate + base;
    const estimatedFare = Math.round(basePrice * surgeMultiplier);

    return { estimatedFare, distance, surgeMultiplier, geohash, demandRatio: ratio };
  }
}

CalculateFareUseCase.MAX_SURGE = MAX_SURGE;
CalculateFareUseCase.SURGE_FLOOR = SURGE_FLOOR;

module.exports = {
  CalculateFareUseCase,
  computeSurge,
  haversineKm,
  round2,
  GEOHASH_PRECISION,
  MAX_SURGE,
  SURGE_FLOOR,
};
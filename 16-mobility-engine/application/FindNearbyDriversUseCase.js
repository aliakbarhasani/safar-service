'use strict';

/**
 * FindNearbyDriversUseCase.js - Mobility Engine (P13-1)
 *
 * UseCase جستجوی رانندگان اطراف مسافر برای Dispatch:
 *   - دریافت مختصات مسافر (lon/lat) و شعاع جستجو
 *   - فراخوانی geoRepository تزریق‌شده (آداپتر RedisGeoRepository — DIP)
 *   - مرتب‌سازی نتیجه بر اساس فاصله (نزدیک‌ترین اول) و بازگرداندن لیست
 *
 * نکته معماری: Mobility به کلاس RedisGeoRepository وابستگی مستقیم ندارد؛
 * هر آداپتوری با متد findNearbyDrivers(lon, lat, radiusKm) پذیرفته می‌شود.
 */

const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 50;

class FindNearbyDriversUseCase {
  /**
   * @param {Object} params
   * @param {{ findNearbyDrivers: Function }} params.geoRepository - آداپتر Redis GEO
   * @param {number} [params.defaultRadiusKm] - شعاع پیش‌فرض (کیلومتر)
   */
  constructor({ geoRepository, defaultRadiusKm = DEFAULT_RADIUS_KM } = {}) {
    if (!geoRepository || typeof geoRepository.findNearbyDrivers !== 'function') {
      throw new Error('FindNearbyDriversUseCase requires a geoRepository with findNearbyDrivers()');
    }
    this.geoRepository = geoRepository;
    this.defaultRadiusKm = defaultRadiusKm;
  }

  /**
   * @param {Object} input
   * @param {number} input.lon - طول جغرافیایی مسافر
   * @param {number} input.lat - عرض جغرافیایی مسافر
   * @param {number} [input.radiusKm] - شعاع جستجو (پیش‌فرض ۵، حداکثر ۵۰)
   * @param {number} [input.limit] - حداکثر تعداد رانندگان بازگشتی (اختیاری)
   * @returns {Promise<{count: number, radiusKm: number, drivers: Array<{driverId: string, distance: number}>}>}
   */
  async execute({ lon, lat, radiusKm, limit } = {}) {
    if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) {
      const err = new Error('lon and lat are required numeric coordinates');
      err.statusCode = 400;
      throw err;
    }

    const radius = (radiusKm === undefined || radiusKm === null)
      ? this.defaultRadiusKm
      : Number(radiusKm);

    if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_RADIUS_KM) {
      const err = new Error(`radiusKm must be between 0 (exclusive) and ${MAX_RADIUS_KM}`);
      err.statusCode = 400;
      throw err;
    }

    const drivers = await this.geoRepository.findNearbyDrivers(
      Number(lon),
      Number(lat),
      radius,
    );

    // مرتب‌سازی نهایی بر اساس فاصله (نزدیک‌ترین اول)
    drivers.sort((a, b) => a.distance - b.distance);

    let result = drivers;
    if (limit !== undefined && limit !== null) {
      const n = Number(limit);
      if (!Number.isInteger(n) || n <= 0) {
        const err = new Error('limit must be a positive integer');
        err.statusCode = 400;
        throw err;
      }
      result = drivers.slice(0, n);
    }

    return { count: result.length, radiusKm: radius, drivers: result };
  }

  /**
   * آداپتر سازگار با `TripDispatchService` (P3-3) — همان قرارداد RedisGeoRepository:
   *   findNearbyDrivers(lon, lat, radiusKm) → آرایه مرتب‌شده بر اساس فاصله (نزدیک‌ترین اول)
   *
   * @param {number} lon
   * @param {number} lat
   * @param {number} [radiusKm]
   * @returns {Promise<Array<{driverId: string, distance: number}>>}
   */
  async findNearbyDrivers(lon, lat, radiusKm) {
    const { drivers } = await this.execute({ lon, lat, radiusKm });
    return drivers;
  }
}

module.exports = { FindNearbyDriversUseCase, DEFAULT_RADIUS_KM, MAX_RADIUS_KM };

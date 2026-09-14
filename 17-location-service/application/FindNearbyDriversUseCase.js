'use strict';

/**
 * FindNearbyDriversUseCase.js - Location Service (P13-1)
 *
 * UseCase جستجوی رانندگان اطراف مسافر:
 *   - دریافت مختصات مسافر و شعاع جستجو
 *   - فراخوانی RedisGeoRepository (که خروجی را ASC بر اساس فاصله می‌دهد)
 *   - بازگرداندن لیست مرتب‌شده رانندگان نزدیک
 */

const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 50;

class FindNearbyDriversUseCase {
  /**
   * @param {Object} params
   * @param {{ findNearbyDrivers: Function }} params.geoRepository - RedisGeoRepository
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
   * @param {number} [input.radiusKm] - شعاع جستجو (پیش‌فرض ۵ کیلومتر، حداکثر ۵۰)
   * @returns {Promise<{ count: number, radiusKm: number, drivers: Array<{driverId: string, distance: number}> }>}
   */
  async execute({ lon, lat, radiusKm } = {}) {
    if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) {
      const err = new Error('lon and lat are required numeric coordinates');
      err.statusCode = 400;
      throw err;
    }

    const radius = radiusKm === undefined || radiusKm === null
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

    // ریپازیتوری با ASC برمی‌گرداند؛ مرتب‌سازی مجدد برای تضمین قرارداد
    drivers.sort((a, b) => a.distance - b.distance);

    return { count: drivers.length, radiusKm: radius, drivers };
  }
}

module.exports = { FindNearbyDriversUseCase, DEFAULT_RADIUS_KM, MAX_RADIUS_KM };
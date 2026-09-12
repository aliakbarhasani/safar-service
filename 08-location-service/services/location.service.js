/**
 * location.service.js - سرویس مکان‌یابی بلادرنگ (P3-1)
 *
 * نگاشت عملیات مکانی به Redis Repository. هیچ منطق تجاری اضافی ندارد؛
 * فقط validate کردن اولیه و فراخوانی repository.
 *
 * ذخیره دائمی در PostgreSQL به Job پس‌زمینه موکول می‌شود.
 */

const { RedisLocationRepository } = require('./redis-location.repository');

class LocationService {
  /**
   * @param {RedisLocationRepository} repository
   */
  constructor(repository) {
    if (!repository) throw new Error('LocationService: repository is required');
    this.repository = repository;
  }

  async updateDriverLocation(driverId, longitude, latitude) {
    return this.repository.updateDriverLocation(driverId, longitude, latitude);
  }

  async findNearbyDrivers(longitude, latitude, radiusInKm) {
    return this.repository.findNearbyDrivers(longitude, latitude, radiusInKm);
  }

  async removeDriverLocation(driverId) {
    return this.repository.removeDriverLocation(driverId);
  }

  async getDriverLocation(driverId) {
    return this.repository.getDriverLocation(driverId);
  }
}

/**
 * کارخانه ساخت سرویس مکان‌یابی با کلاینت Redis تزریقی.
 * @param {Object} redisClient
 * @param {Object} [opts]
 * @returns {LocationService}
 */
function createLocationService(redisClient, opts = {}) {
  const repository = new RedisLocationRepository(redisClient, opts);
  return new LocationService(repository);
}

module.exports = { LocationService, createLocationService };

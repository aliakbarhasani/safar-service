/**
 * location.service.js - سرویس مکان‌یابی بلادرنگ (P3-1 + P3-2)
 *
 * نگاشت عملیات مکانی به Redis Repository. هیچ منطق تجاری اضافی ندارد؛
 * فقط validate کردن اولیه و فراخوانی repository.
 *
 * P3-2 (Write-Behind): همزمان با GEOADD، موقعیت در بافر تاریخچه نیز
 * اضافه می‌شود تا Background Worker بتواند آن را در PostgreSQL ذخیره کند.
 * ذخیره دائمی در PostgreSQL به Job پس‌زمینه موکول می‌شود.
 */

const { RedisLocationRepository } = require('../infrastructure/redis/redis-location.repository');

class LocationService {
  /**
   * @param {RedisLocationRepository} repository
   */
  constructor(repository) {
    if (!repository) throw new Error('LocationService: repository is required');
    this.repository = repository;
  }

  /**
   * به‌روزرسانی موقعیت راننده (GEOADD + بافر تاریخچه برای Write-Behind).
   * @param {string} driverId
   * @param {number} longitude
   * @param {number} latitude
   * @returns {Promise<{ok: boolean, driverId: string}>}
   */
  async updateDriverLocation(driverId, longitude, latitude) {
    const result = await this.repository.updateDriverLocation(driverId, longitude, latitude);
    // P3-2: بافر کردن برای Write-Behind Sync (غیرمسدود، خطا نادیده گرفته می‌شود)
    try {
      await this.repository.bufferLocationHistory(driverId, longitude, latitude);
    } catch (err) {
      // بافر شدن نباید عملیات اصلی را بشکند
      console.warn(`[LocationService] bufferLocationHistory failed for ${driverId}:`, err.message);
    }
    return result;
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

  /**
   * دریافت اندازه بافر تاریخچه (برای Worker).
   * @returns {Promise<number>}
   */
  async getHistoryBufferSize() {
    return this.repository.getHistoryBufferSize();
  }

  /**
   * تخلیه بافر تاریخچه (برای Worker).
   * @returns {Promise<Array>}
   */
  async drainHistoryBuffer() {
    return this.repository.drainHistoryBuffer();
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

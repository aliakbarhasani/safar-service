'use strict';

/**
 * RedisGeoRepository.js - Location Service (P13-1)
 *
 * ریپازیتوری مکانی مبتنی بر Redis GEO برای ردیابی رانندگان فعال:
 *   - GEOADD روی کلید `drivers_location` (عضو: driverId)
 *   - GEOSEARCH با WITHDIST ASC برای یافتن نزدیک‌ترین رانندگان
 *   - ZREM برای حذف راننده (آفلاین / پذیرش سفر)
 *   - کلید `driver_last_active:<driverId>` با TTL ۵ دقیقه تا رانندگان
 *     غیرفعال به مرور از نتایج حذف شوند.
 *
 * کلاینت Redis از بیرون تزریق می‌شود (DIP — تست‌پذیری با Mock).
 */

const DEFAULT_KEY = 'drivers_location';
const DEFAULT_LAST_ACTIVE_PREFIX = 'driver_last_active:';
const DEFAULT_LAST_ACTIVE_TTL_SECONDS = 300; // ۵ دقیقه

class RedisGeoRepository {
  constructor({
    redisClient,
    key = DEFAULT_KEY,
    lastActivePrefix = DEFAULT_LAST_ACTIVE_PREFIX,
    lastActiveTtlSeconds = DEFAULT_LAST_ACTIVE_TTL_SECONDS,
  } = {}) {
    if (!redisClient) {
      throw new Error('RedisGeoRepository requires a redisClient');
    }
    this.redis = redisClient;
    this.key = key;
    this.lastActivePrefix = lastActivePrefix;
    this.lastActiveTtlSeconds = lastActiveTtlSeconds;
  }

  /**
   * به‌روزرسانی موقعیت راننده در ایندکس GEO + refresh کلید آخرین فعالیت.
   * @param {string} driverId
   * @param {number} lon - طول جغرافیایی (اولین آرگومان GEOADD)
   * @param {number} lat - عرض جغرافیایی
   */
  async updateDriverLocation(driverId, lon, lat) {
    if (!driverId) throw new Error('driverId is required');
    if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) {
      throw new Error('valid lon/lat coordinates are required');
    }
    const lonN = Number(lon);
    const latN = Number(lat);
    if (lonN < -180 || lonN > 180 || latN < -90 || latN > 90) {
      throw new Error('coordinates out of range');
    }

    // GEOADD key lon lat member
    await this.redis.geoadd(this.key, lonN, latN, String(driverId));

    // کلید آخرین فعالیت با TTL — راننده‌ای که آپدیت نفرستد به مرور حذف می‌شود
    await this.redis.set(
      `${this.lastActivePrefix}${driverId}`,
      String(Date.now()),
      'EX',
      this.lastActiveTtlSeconds,
    );
    return { driverId: String(driverId), lon: lonN, lat: latN };
  }

  /**
   * یافتن رانندگان در شعاع مشخص — مرتب‌شده بر اساس فاصله (ASC).
   * @param {number} lon
   * @param {number} lat
   * @param {number} radiusKm
   * @returns {Promise<Array<{driverId: string, distance: number}>>}
   */
  async findNearbyDrivers(lon, lat, radiusKm = 5) {
    const r = Number(radiusKm);
    if (!Number.isFinite(r) || r <= 0) {
      throw new Error('radiusKm must be a positive number');
    }
    if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) {
      throw new Error('valid lon/lat coordinates are required');
    }

    // GEOSEARCH key FROMLONLAT lon lat BYRADIUS r km WITHDIST ASC
    const raw = await this.redis.geosearch(
      this.key,
      'FROMLONLAT',
      Number(lon),
      Number(lat),
      'BYRADIUS',
      r,
      'km',
      'WITHDIST',
      'ASC',
    );

    // ioredis خروجی تخت [member, dist, member, dist, ...] برمی‌گرداند
    const results = [];
    for (let i = 0; i < raw.length; i += 2) {
      results.push({
        driverId: String(raw[i]),
        distance: Number(raw[i + 1]),
      });
    }
    return results;
  }

  /**
   * حذف راننده از ایندکس GEO (آفلاین شدن / پذیرش سفر).
   * @param {string} driverId
   */
  async removeDriverLocation(driverId) {
    if (!driverId) throw new Error('driverId is required');
    const removed = await this.redis.zrem(this.key, String(driverId));
    await this.redis.del(`${this.lastActivePrefix}${driverId}`);
    return { driverId: String(driverId), removed: removed === 1 };
  }
}

module.exports = { RedisGeoRepository, DEFAULT_KEY, DEFAULT_LAST_ACTIVE_TTL_SECONDS };
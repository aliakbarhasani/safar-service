/**
 * redis-location.repository.js - Redis Geo-location Repository (P3-1)
 *
 * پیاده‌سازی عملیات مکان‌یابی بلادرنگ رانندگان با استفاده از
 * دستورات جغرافیایی Redis (GEOADD / GEOSEARCH / ZREM).
 *
 * جلوگیری از فشار به PostgreSQL: لوکیشن رانندگان فقط در RAM (Redis)
 * نوشته می‌شود. ذخیره دائمی در PostgreSQL به یک Job پس‌زمینه با فواصل
 * ۵ دقیقه‌ای موکول می‌شود (در صورت وجود).
 *
 * Dependency Injection: کلاینت Redis از بیرون تزریق می‌شود تا
 * تست‌ها بدون Redis واقعی با mock قابل اجرا باشند.
 */

const LOCATION_KEY = 'drivers:online:locations';
const DEFAULT_TTL_SECONDS = 300;

class RedisLocationRepository {
  /**
   * @param {Object} redisClient - کلاینت Redis (ioredis یا سازگار)
   * @param {Object} [opts]
   * @param {string} [opts.key] - کلید Sorted Set مکان‌ها
   * @param {number} [opts.ttlSeconds] - TTL heartbeat هر راننده
   */
  constructor(redisClient, { key = LOCATION_KEY, ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
    if (!redisClient) {
      throw new Error('RedisLocationRepository: redisClient is required');
    }
    this.redis = redisClient;
    this.key = key;
    this.ttlSeconds = ttlSeconds;
    this._usingGeoSearch = typeof redisClient.geosearch === 'function';
  }

  /**
   * ذخیره/به‌روزرسانی موقعیت مکانی راننده (GEOADD).
   * @param {string} driverId
   * @param {number} longitude - طول جغرافیایی [-180, 180]
   * @param {number} latitude  - عرض جغرافیایی [-90, 90]
   * @returns {Promise<{ok: boolean, driverId: string}>}
   */
  async updateDriverLocation(driverId, longitude, latitude) {
    if (!driverId) throw new Error('driverId is required');
    if (longitude == null || latitude == null) {
      throw new Error('longitude and latitude are required');
    }
    const lng = Number(longitude);
    const lat = Number(latitude);
    if (Number.isNaN(lng) || Number.isNaN(lat)) {
      throw new Error('longitude and latitude must be numeric');
    }
    if (lng < -180 || lng > 180) throw new Error('longitude must be between -180 and 180');
    if (lat < -90 || lat > 90) throw new Error('latitude must be between -90 and 90');

    await this.redis.geoadd(this.key, lng, lat, String(driverId));
    return { ok: true, driverId: String(driverId), longitude: lng, latitude: lat };
  }

  /**
   * جستجوی رانندگان اطراف (GEOSEARCH یا GEORADIUS fallback).
   * @param {number} longitude
   * @param {number} latitude
   * @param {number} radiusInKm
   * @returns {Promise<Array<{driverId: string, distanceKm: number, longitude: number, latitude: number}>>}
   */
  async findNearbyDrivers(longitude, latitude, radiusInKm) {
    if (longitude == null || latitude == null || radiusInKm == null) {
      throw new Error('longitude, latitude and radiusInKm are required');
    }
    const lng = Number(longitude);
    const lat = Number(latitude);
    const radius = Number(radiusInKm);
    if (Number.isNaN(lng) || Number.isNaN(lat) || Number.isNaN(radius)) {
      throw new Error('longitude, latitude and radiusInKm must be numeric');
    }
    if (radius <= 0) throw new Error('radiusInKm must be positive');

    let members = [];

    if (this._usingGeoSearch) {
      const results = await this.redis.geosearch(
        this.key,
        'FROMLONLAT', lng, lat,
        'BYRADIUS', radius, 'km',
        'WITHCOORD', 'WITHDIST', 'ASC',
      );
      members = this._parseGeoResults(results, lng, lat);
    } else {
      const results = await this.redis.georadius(
        this.key, lng, lat, radius, 'km',
        'WITHCOORD', 'WITHDIST', 'ASC',
      );
      members = this._parseGeoResults(results, lng, lat);
    }

    return members;
  }

  /**
   * تجزیه نتایج GEOSEARCH/GEORADIUS به فرمت یکپارچه.
   * @private
   */
  _parseGeoResults(results, fallbackLng, fallbackLat) {
    const members = [];
    if (!results || !Array.isArray(results)) return members;
    for (const entry of results) {
      const member = Array.isArray(entry) ? entry[0] : entry;
      const dist = Array.isArray(entry) ? parseFloat(entry[1]) : 0;
      let coordLng = fallbackLng;
      let coordLat = fallbackLat;
      if (Array.isArray(entry) && Array.isArray(entry[2])) {
        coordLng = parseFloat(entry[2][0]);
        coordLat = parseFloat(entry[2][1]);
      }
      members.push({
        driverId: String(member),
        distanceKm: Math.round(dist * 1000) / 1000,
        longitude: Math.round(coordLng * 1e6) / 1e6,
        latitude: Math.round(coordLat * 1e6) / 1e6,
      });
    }
    return members;
  }

  /**
   * حذف راننده از لیست موقعیت‌ها (ZREM) — برای آفلاین شدن یا پذیرش سفر.
   * @param {string} driverId
   * @returns {Promise<{ok: boolean, removed: boolean, driverId: string}>}
   */
  async removeDriverLocation(driverId) {
    if (!driverId) throw new Error('driverId is required');
    const removed = await this.redis.zrem(this.key, String(driverId));
    return { ok: true, removed: removed > 0, driverId: String(driverId) };
  }

  /**
   * دریافت موقعیت یک راننده (GEOPOS).
   * @param {string} driverId
   * @returns {Promise<{driverId: string, longitude: number, latitude: number}|null>}
   */
  async getDriverLocation(driverId) {
    if (!driverId) throw new Error('driverId is required');
    const pos = await this.redis.geopos(this.key, String(driverId));
    if (!pos || !pos[0]) return null;
    const [lng, lat] = pos[0];
    return {
      driverId: String(driverId),
      longitude: parseFloat(lng),
      latitude: parseFloat(lat),
    };
  }
}

module.exports = { RedisLocationRepository, LOCATION_KEY, DEFAULT_TTL_SECONDS };

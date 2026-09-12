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
const HISTORY_BUFFER_KEY = 'location:history:buffer';
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
   * بافر کردن تاریخچه مکانی برای Write-Behind Sync (P3-2).
   * داده‌ها را به صورت JSON در Redis List با RPUSH اضافه می‌کند.
   * @param {string} driverId
   * @param {number} longitude
   * @param {number} latitude
   * @param {string} [timestamp] - ISO timestamp (پیش‌فرض: زمان حال)
   * @returns {Promise<number>} طول صف بعد از افزودن
   */
  async bufferLocationHistory(driverId, longitude, latitude, timestamp = null) {
    if (!driverId) throw new Error('driverId is required');
    const record = JSON.stringify({
      driver_id: String(driverId),
      longitude: Number(longitude),
      latitude: Number(latitude),
      recorded_at: timestamp || new Date().toISOString(),
    });
    const len = await this.redis.rpush(HISTORY_BUFFER_KEY, record);
    return len;
  }

  /**
   * استخراج و خالی کردن بافر تاریخچه (اتمیک با MULTI/EXEC).
   * برای Background Worker جهت Bulk Insert در PostgreSQL.
   * @returns {Promise<Array<{driver_id: string, longitude: number, latitude: number, recorded_at: string}>>}
   */
  async drainHistoryBuffer() {
    const results = await this.redis.multi();
    if (!results) {
      // fallback: non-transactional read + delete
      const raw = await this.redis.lrange(HISTORY_BUFFER_KEY, 0, -1);
      await this.redis.del(HISTORY_BUFFER_KEY);
      return raw
        .map((item) => {
          try { return JSON.parse(item); } catch { return null; }
        })
        .filter(Boolean);
    }
    return [];
  }

  /**
   * دریافت طول بافر (بدون خالی کردن) — برای مانیتورینگ.
   * @returns {Promise<number>}
   */
  async getHistoryBufferSize() {
    return await this.redis.llen(HISTORY_BUFFER_KEY);
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

module.exports = { RedisLocationRepository, LOCATION_KEY, HISTORY_BUFFER_KEY, DEFAULT_TTL_SECONDS };

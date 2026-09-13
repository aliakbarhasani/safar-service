'use strict';

/**
 * DynamicConfigStore — موتور تنظیمات پویا با کش محلی + Redis
 *
 * الگوی Cache-Aside با TTL کوتاه (۶۰ ثانیه) برای جلوگیری از فشار به Redis.
 * مقادیر در Redis با پیشوند `app_config:` ذخیره می‌شوند.
 */

const DEFAULT_TTL_SECONDS = 60;

class DynamicConfigStore {
  /**
   * @param {Object} deps
   * @param {Object} deps.redisClient — کلاینت ioredis (یا mock برای تست)
   * @param {Object} [deps.defaults] — مقادیر پیش‌فرض (fallback)
   * @param {number} [deps.cacheTtlSeconds=60] — TTL کش محلی
   */
  constructor({ redisClient = null, defaults = {}, cacheTtlSeconds = DEFAULT_TTL_SECONDS } = {}) {
    this.redis = redisClient;
    this.defaults = defaults;
    this.cacheTtlMs = cacheTtlSeconds * 1000;
    this._cache = new Map(); // { key: { value, expiresAt } }
    this._prefix = 'app_config:';
  }

  _cacheKey(key) {
    return this._prefix + key;
  }

  _getLocal(key) {
    const entry = this._cache.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this._cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  _setLocal(key, value) {
    this._cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }

  /**
   * دریافت مقدار تنظیم
   * @param {string} key
   * @param {*} defaultValue
   * @returns {Promise<*>}
   */
  async getConfig(key, defaultValue) {
    // 1) کش محلی
    const local = this._getLocal(key);
    if (local !== undefined) return local;

    // 2) Redis
    if (this.redis && typeof this.redis.get === 'function') {
      try {
        const raw = await this.redis.get(this._cacheKey(key));
        if (raw != null) {
          const parsed = JSON.parse(raw);
          this._setLocal(key, parsed);
          return parsed;
        }
      } catch (_) {
        // خطای Redis → fallback به defaults
      }
    }

    // 3) defaults
    if (key in this.defaults) return this.defaults[key];
    if (defaultValue !== undefined) return defaultValue;
    return null;
  }

  /**
   * تنظیم مقدار
   * @param {string} key
   * @param {*} value
   * @returns {Promise<boolean>}
   */
  async setConfig(key, value) {
    // به‌روزرسانی کش محلی
    this._setLocal(key, value);

    // به‌روزرسانی Redis
    if (this.redis && typeof this.redis.set === 'function') {
      try {
        await this.redis.set(this._cacheKey(key), JSON.stringify(value));
        return true;
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  /**
   * دریافت چند تنظیم به صورت یکجا
   * @param {string[]} keys
   * @returns {Promise<Object>}
   */
  async getMultiple(keys) {
    const result = {};
    for (const key of keys) {
      result[key] = await this.getConfig(key);
    }
    return result;
  }

  /**
   * پاک کردن کش محلی (برای تست یا force-refresh)
   */
  clearLocalCache() {
    this._cache.clear();
  }
}

module.exports = { DynamicConfigStore, DEFAULT_TTL_SECONDS };

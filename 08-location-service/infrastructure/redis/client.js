/**
 * client.js - Redis Client Factory for Location Service (P3-1)
 *
 * تلاش برای بارگذاری `ioredis` از node_modules. اگر موجود نباشد،
 * یک no-op client برمی‌گرداند تا سرویس crash نکند (degraded mode).
 * تنظیمات از 14-config-system خوانده می‌شود.
 */

let Redis = null;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  Redis = require('ioredis');
} catch (_) {
  Redis = null;
}

/**
 * ساخت کلاینت Redis از تنظیمات.
 * @param {Object} [opts]
 * @param {string} [opts.host]
 * @param {number} [opts.port]
 * @param {string} [opts.password]
 * @param {number} [opts.db]
 * @returns {Object|null} - کلاینت Redis یا null (degraded)
 */
function createRedisClient(opts = {}) {
  if (!Redis) {
    console.warn('[location-service] ioredis not available — running in degraded (no-op) mode');
    return createNoOpClient();
  }
  try {
    const client = new Redis({
      host: opts.host || '127.0.0.1',
      port: opts.port || 6379,
      password: opts.password || undefined,
      db: opts.db || 0,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1000)),
    });
    return client;
  } catch (err) {
    console.warn('[location-service] Redis client creation failed:', err.message);
    return createNoOpClient();
  }
}

/**
 * کلاینت no-op برای زمانی که Redis در دسترس نیست.
 * همه متدها Promise خالی برمی‌گارند تا سرویس کار کند ولی مکان ذخیره نکند.
 */
function createNoOpClient() {
  const noOp = async () => 0;
  return {
    geoadd: noOp,
    geosearch: async () => [],
    georadius: async () => [],
    zrem: noOp,
    geopos: async () => [null],
    status: 'offline',
    quit: async () => {},
    disconnect: () => {},
  };
}

module.exports = { createRedisClient, createNoOpClient };

/**
 * redisClient.js - Redis Client Factory for Pricing Service (P6-1)
 *
 * Tries to load `ioredis` from node_modules. If unavailable (or connection
 * creation fails) it returns a safe no-op client so the gateway keeps serving
 * fare estimates in degraded mode (no demand/surge data, multiplier = 1.0).
 * Settings come from `14-config-system/server.config#redis`.
 */

const config = require('../../14-config-system/server.config');

let Redis = null;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  Redis = require('ioredis');
} catch (_) {
  Redis = null;
}

/**
 * @param {Object} [opts] overrides host/port/password/db
 * @returns {Object} Redis client (ioredis) or a no-op client
 */
function createRedisClient(opts = {}) {
  if (!Redis) {
    console.warn('[pricing-service] ioredis not available — running in degraded (no-op) mode');
    return createNoOpClient();
  }
  const cfg = config.redis || {};
  try {
        const redis = new Redis({
      host: opts.host || cfg.host || '127.0.0.1',
      port: opts.port || cfg.port || 6379,
      password: opts.password !== undefined ? opts.password : cfg.password,
      db: opts.db != null ? opts.db : cfg.db || 0,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // bounded retry: stop reconnecting after 5 attempts (prevents reconnect spam
      // when Redis is down). maxRetriesPerRequest=2 bounds per-op latency.
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1000)),
    });

    // 🔒 fail-open: an ECONNREFUSED on a downed Redis must NOT crash the Gateway.
    // Without this listener a dropped Redis would throw an unhandled 'error'
    // event during boot (ioredis emits 'error' once before retryStrategy gives up).
    // Pricing/surge then degrades to defaults (multiplier 1.0) instead of crashing.
    redis.on('error', (err) => {
      console.warn('[pricing-service] Redis connection warning — degraded mode:', err.message);
    });

    return redis;
  } catch (err) {
    console.warn('[pricing-service] Redis client creation failed, degrading:', err.message);
    return createNoOpClient();
  }
}

/**
 * No-op client: numeric strings, so surge computations degrade to 1.0.
 */
function createNoOpClient() {
  const noOp = async () => 0;
  return {
    incr: noOp,
    get: async () => null,
    set: noOp,
    expire: noOp,
    status: 'offline',
    quit: async () => {},
    disconnect: () => {},
  };
}

module.exports = { createRedisClient, createNoOpClient };
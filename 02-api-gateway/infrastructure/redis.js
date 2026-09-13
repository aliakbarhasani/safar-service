'use strict';

/**
 * Redis Client — کلاینت مشترک برای API Gateway
 * تزریق شده از config-system با fallback به null (fail-open)
 */

const config = require('../../14-config-system/server.config');

let client = null;

try {
  const Redis = require('ioredis');
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // بدون تلاش مجازی — fail-fast
  });

  client.on('error', (err) => {
    console.warn('[GatewayRedis] Connection error (degraded mode):', err.message);
    client = null; // fail-open
  });

  // اتصال غیربوابل (lazyConnect) — فقط در اولین درخواست واقعی متصل می‌شود
  client.connect().catch(() => {
    console.warn('[GatewayRedis] Could not connect, running in degraded mode');
    client = null;
  });
} catch (err) {
  // اگر ioredis نصب نباشد، در degraded mode کار کن
  console.warn('[GatewayRedis] ioredis not available, running in degraded mode');
  client = null;
}

module.exports = {
  client: client,
  isAvailable: () => client !== null && client.status === 'ready',
};

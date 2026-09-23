/**
 * io.js - Socket.io Instance with Redis Adapter (P4-1)
 *
 * Creates a Socket.io server configured with @socket.io/redis-adapter so
 * that messages are synchronised across multiple horizontally-scaled
 * instances of this service. Falls back to the in-memory adapter when
 * Redis is unavailable (development / single-instance mode).
 */

const { Server } = require('socket.io');
const config = require('../../config');

/**
 * Factory: create a Socket.io instance bound to an HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @param {Object} [opts]
 * @param {Function} [opts.createRedisClient] - custom factory for ioredis clients
 *   (used in tests). Signature: (type: 'pub'|sub') => RedisClient
 * @returns {Server}
 */
function createIo(httpServer, { createRedisClient = null } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: config.cors.methods,
      credentials: true,
    },
    pingInterval: config.ping.interval,
    pingTimeout: config.ping.timeout,
  });

  // ── Redis Adapter (multi-instance horizontal scaling) ──────────────────
  let adapter = null;
  try {
    if (createRedisClient) {
      adapter = createRedisClient;
    } else {
      // Lazy-require so the package is optional in dev (fallback below)
      // eslint-disable-next-line global-require
      const { createAdapter } = require('@socket.io/redis-adapter');
      // eslint-disable-next-line global-require
      const Redis = require('ioredis');

            adapter = (type) => {
        const client = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          keyPrefix: `${config.redis.keyPrefix}${type}:`,
          lazyConnect: false,
          maxRetriesPerRequest: 2,
          // bounded retry: stop reconnecting after 5 attempts so a downed Redis
          // doesn't spam reconnect errors in dev / single-instance mode.
          retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1000)),
        });
        // fail-open: log connection issues instead of letting them throw as
        // unhandled 'error' events (ECONNREFUSED) and crash the process.
        client.on('error', (err) => {
          console.warn(`[WS Redis ${type}] Connection warning — degraded mode:`, err.message);
        });
        return client;
      };

      const pubClient = adapter('pub');
      const subClient = adapter('sub');
      io.adapter(createAdapter(pubClient, subClient));

      pubClient.on('error', (err) =>
        console.error('[WS Redis pub error]', err.message),
      );
      subClient.on('error', (err) =>
        console.error('[WS Redis sub error]', err.message),
      );
    }
  } catch (err) {
    // Graceful fallback: single-instance mode without Redis adapter
    console.warn(
      '[WS io] Redis adapter unavailable, falling back to in-memory adapter:',
      err.message,
    );
  }

  return io;
}

module.exports = { createIo };

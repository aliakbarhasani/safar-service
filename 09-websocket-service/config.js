/**
 * config.js - WebSocket Service Configuration
 *
 * Centralized config with env-var overrides and sensible defaults.
 * Mirrors the pattern used across other safar-service microservices
 * (14-config-system/server.config.js).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const config = {
  port: parseInt(process.env.WS_PORT, 10) || 3020,
  env: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'safar-service-jwt-secret-key-2026',
    expiration: process.env.JWT_EXPIRATION || '7d',
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'safar:',
  },

  cors: {
    origin: process.env.WS_CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },

  // Heartbeat / ping settings
  ping: {
    interval: parseInt(process.env.WS_PING_INTERVAL, 10) || 25000,
    timeout: parseInt(process.env.WS_PING_TIMEOUT, 10) || 60000,
  },
};

module.exports = config;

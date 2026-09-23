/**
 * config.js - WebSocket Service Configuration
 *
 * Centralized config with env-var overrides and sensible defaults.
 * Mirrors the pattern used across other safar-service microservices
 * (14-config-system/server.config.js).
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// ── (P0 امنیتی) کلید عمومی RS256 — اجباری و Fail-Fast ────────────────────────
// SECURITY: سکرت متقارن/متنی (HS256) و مقدار پیش‌فرض `safar-service-jwt-secret-key-2026`
// به‌کلی حذف شد. توکن‌ها فقط با الگوریتم RS256 و کلید عمومی `jwt_public.pem` وریفای می‌شوند.
// در صورت نبود یا نامعتبر بودن کلید، سرویس با خطای روشن متوقف می‌شود (Fail-Fast)
// تا هرگز با احراز هویت ناامن بالا نیاید.
const JWT_PUBLIC_KEY_PATH =
  process.env.JWT_PUBLIC_KEY_PATH || path.resolve(__dirname, '..', '00-infrastructure', 'keys', 'jwt_public.pem');

let jwtPublicKey;
try {
  jwtPublicKey = fs.readFileSync(JWT_PUBLIC_KEY_PATH, 'utf8');
  if (!jwtPublicKey.includes('-----BEGIN PUBLIC KEY-----')) {
    throw new Error('file content is not a PEM RSA public key');
  }
} catch (err) {
  throw new Error(
    `[websocket-service] FATAL: RS256 public key is required but could not be loaded from ` +
    `"${JWT_PUBLIC_KEY_PATH}" (${err.message}). ` +
    `Generate the key pair with 00-infrastructure/keys/generate-keys.js and restart the service.`
  );
}

const config = {
  port: parseInt(process.env.WS_PORT, 10) || 3020,
  env: process.env.NODE_ENV || 'development',

  jwt: {
    // فقط RS256 — بدون fallback متقارن
    algorithm: 'RS256',
    publicKey: jwtPublicKey,
    publicKeyPath: JWT_PUBLIC_KEY_PATH,
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

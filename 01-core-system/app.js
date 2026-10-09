const express = require('express');
const cors = require('cors');
const config = require('../14-config-system/server.config');
const apiGateway = require('../02-api-gateway/api.routes');
const { createRateLimiter } = require('../02-api-gateway/middlewares/rate-limiter.middleware');
const { client: gatewayRedisClient } = require('../02-api-gateway/infrastructure/redis');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const app = express();

// Global middleware
const configuredCorsOrigins = String(config.cors.origin || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// HttpOnly session cookies are used by the web client. In development, reflect
// the requesting origin when CORS_ORIGIN is '*'; wildcard + credentials is invalid.
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (configuredCorsOrigins.includes('*') && config.env !== 'production') {
      return callback(null, origin);
    }
    if (configuredCorsOrigins.includes(origin)) return callback(null, origin);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Global API rate limit — تمام درخواست‌های ورودی قبل از Gateway کنترل می‌شوند.
// در production، نبود/قطع Redis نباید محدودکننده را بی‌اثر کند.
app.use('/api', createRateLimiter({
  keyPrefix: 'rl:gateway',
  redisClient: gatewayRedisClient,
}));

// API Gateway - تنها نقطه ورود تمام درخواست‌ها (طبق بند ۷ سند مادر)
app.use('/', apiGateway);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;

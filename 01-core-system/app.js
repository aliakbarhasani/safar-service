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
app.use(cors({ origin: config.cors.origin }));
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

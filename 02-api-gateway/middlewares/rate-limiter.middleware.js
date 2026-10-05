'use strict';

/**
 * Rate Limiter Middleware — Sliding Window with Redis (MULTI/EXEC atomic)
 * استفاده از MULTI/EXEC برای ZREMRANGEBYSCORE، ZADD، ZCARD و EXPIRE
 *
 * @see P9-2: محدودکننده نرخ درخواست برای جلوگیری از سوءاستفاده و DDoS
 */

const config = require('../../14-config-system/server.config');

/**
 * ساخت میدلور محدودکننده نرخ درخواست با الگوی Sliding Window
 * @param {Object} options
 * @param {string} options.keyPrefix — پیشوند کلید Redis (مثلاً 'rl:general')
 * @param {number} options.windowMs — اندازه پنجره زمانی (ms)
 * @param {number} options.maxRequests — حداکثر تعداد درخواست در هر پنجره
 * @param {Function} options.keyGenerator — تابع استخراج کلید یکتا
 * @param {Object} options.redisClient — کلاینت ioredis
 */
function createRateLimiter(options = {}) {
  const {
    keyPrefix = 'rl',
    windowMs = config.rateLimit.windowMs || 60000,
    maxRequests = config.rateLimit.maxRequests || 100,
    keyGenerator = null,
    redisClient = null,
  } = options;

  return async function rateLimiterMiddleware(req, res, next) {
    const isProduction = process.env.NODE_ENV === 'production';

    // در production محدودکننده نباید در نبود Redis خاموش شود؛
    // در محیط توسعه/تست برای اجرای محلی بدون Redis عبور مجاز است.
    if (!redisClient) {
      if (!isProduction) return next();
      return res.status(503).json({
        success: false,
        error: 'Rate limiting service unavailable',
      });
    }

    let identifier;
    if (keyGenerator && typeof keyGenerator === 'function') {
      identifier = keyGenerator(req);
    } else if (req.user && (req.user.userId || req.user.id)) {
      identifier = req.user.userId || req.user.id;
    } else if (req.ip) {
      identifier = req.ip;
    } else {
      identifier = 'anonymous';
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `${keyPrefix}:${identifier}`;

    try {
      // Sliding Window با Redis Sorted Set + MULTI/EXEC (اتمیک)
      const multi = redisClient.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 11)}`);
      multi.zcard(key);
      multi.pexpire(key, windowMs);

      const results = await multi.exec();
      const currentCount = results[2][1];

      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - currentCount)));
      res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));

      if (currentCount > maxRequests) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({
          success: false,
          error: 'Too Many Requests — rate limit exceeded',
          retryAfterMs: windowMs,
        });
      }

      return next();
    } catch (error) {
      console.warn('[RateLimiter] Redis error:', error.message);
      // Fail-closed فقط در production؛ در توسعه/تست Redis اختیاری است.
      if (isProduction) {
        return res.status(503).json({
          success: false,
          error: 'Rate limiting service unavailable',
        });
      }
      return next();
    }
  };
}

module.exports = { createRateLimiter };

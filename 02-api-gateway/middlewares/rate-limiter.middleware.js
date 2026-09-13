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
 * @param {Function} options.keyGenerator — تابع استخراج کلید یکتای کاربر
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
    // در صورت عدم وجود Redis، میدلور را غیرفعال کن (fail-open)
    if (!redisClient) {
      return next();
    }

    // استخراج کلید یکتا
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
      // الگوی Sliding Window با Redis Sorted Set + MULTI/EXEC (اتمیک):
      // 1. حذف رکوردهای قدیمی‌تر از پنجره زمانی
      // 2. افزودن رکورد جدید (timestamp به عنوان score و member)
      // 3. شمارش تعداد رکوردهای موجود در پنجره
      // 4. تنظیم TTL برای جلوگیری از انباشت کلیدها
      const multi = redisClient.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, `${now}-${Math.random().toString(36).substr(2, 9)}`);
      multi.zcard(key);
      multi.pexpire(key, windowMs);

      const results = await multi.exec();
      const currentCount = results[2][1]; // نتیجه ZCARD

      // تنظیم هدرهای استاندارد Rate Limit
      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - currentCount)));
      res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));

      // بررسی عبور از لیمیت
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
      // در خطا، درخواست را عبور بده (fail-open) اما لاگ بگیر
      console.warn('[RateLimiter] Redis error, allowing request:', error.message);
      return next();
    }
  };
}

module.exports = { createRateLimiter };

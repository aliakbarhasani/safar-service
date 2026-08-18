/**
 * RateLimitMiddleware
 *
 * Provides two rate-limiting strategies:
 *   1. globalRateLimit  – 100 requests / minute / IP (applied to all routes)
 *   2. strictRateLimit  – 5 requests / 3 minutes / key (applied to OTP & login)
 *
 * Uses an in-memory sliding-window store. No external dependencies.
 */

/**
 * In-memory sliding window store.
 * Each key maps to an array of timestamps.
 */
class RateLimitStore {
  constructor() {
    this._store = new Map();
    // Periodic cleanup every 5 minutes
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    this._cleanupInterval.unref();
  }

  /**
   * Record a hit and return the count of hits within the window.
   * @param {string} key   – identifier (IP or phone+IP)
   * @param {number} windowMs – window size in milliseconds
   * @returns {number} count of hits in the current window
   */
  hit(key, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;

    if (!this._store.has(key)) {
      this._store.set(key, []);
    }

    const timestamps = this._store.get(key);
    // Remove expired entries
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    timestamps.push(now);
    return timestamps.length;
  }

  /**
   * Get current count without recording a hit.
   */
  count(key, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = this._store.get(key);
    if (!timestamps) return 0;
    return timestamps.filter((t) => t >= cutoff).length;
  }

  _cleanup() {
    const now = Date.now();
    // Clean entries older than 10 minutes
    const cutoff = now - 10 * 60 * 1000;
    for (const [key, timestamps] of this._store.entries()) {
      while (timestamps.length > 0 && timestamps[0] < cutoff) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        this._store.delete(key);
      }
    }
  }
}

// Shared store instance
const sharedStore = new RateLimitStore();

/**
 * Get client IP from request.
 */
function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/**
 * Global rate limiter: 100 requests per minute per IP.
 */
function globalRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100;

  const count = sharedStore.hit(`global:${ip}`, windowMs);
  const remaining = Math.max(0, maxRequests - count);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Window', '60s');

  if (count > maxRequests) {
    return res.status(429).json({
      success: false,
      status_code: 429,
      message: 'Too many requests. Please slow down.',
      error: 'RATE_LIMIT_EXCEEDED',
    });
  }

  next();
}

/**
 * Strict rate limiter: 5 requests per 3 minutes.
 * Key can be based on phone number (from body) or IP.
 * @param {Object} options - { keyFn: (req) => string, maxRequests, windowMs }
 */
function strictRateLimit(options = {}) {
  const maxRequests = options.maxRequests || 5;
  const windowMs = options.windowMs || 3 * 60 * 1000; // 3 minutes
  const keyFn =
    options.keyFn ||
    ((req) => {
      const ip = getClientIp(req);
      const phone = req.body?.phoneNumber || 'unknown';
      return `strict:${phone}:${ip}`;
    });

  return (req, res, next) => {
    const key = keyFn(req);
    const count = sharedStore.hit(key, windowMs);
    const remaining = Math.max(0, maxRequests - count);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Window', `${Math.round(windowMs / 1000)}s`);

    if (count > maxRequests) {
      return res.status(429).json({
        success: false,
        status_code: 429,
        message: 'Too many requests. Please try again later.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(windowMs / 1000),
      });
    }

    next();
  };
}

module.exports = {
  globalRateLimit,
  strictRateLimit,
  RateLimitStore,
  sharedStore,
};
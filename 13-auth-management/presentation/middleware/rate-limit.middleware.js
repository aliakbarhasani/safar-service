/**
 * RateLimitMiddleware
 *
 * Provides:
 *   1. globalRateLimit – 100 requests / minute / client IP
 *   2. strictRateLimit – 5 requests / 3 minutes / phone+IP
 *   3. phoneRateLimit – 5 requests / 3 minutes / phone number
 *
 * The phone-only limiter is important for OTP because an attacker must not
 * be able to bypass the OTP/SMS limit simply by changing IP addresses.
 *
 * This store is process-local. A shared Redis-backed limiter remains the
 * correct production solution for multi-instance deployments.
 */

class RateLimitStore {
  constructor() {
    this._store = new Map();
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    this._cleanupInterval.unref();
  }

  hit(key, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;

    if (!this._store.has(key)) {
      this._store.set(key, []);
    }

    const timestamps = this._store.get(key);
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    timestamps.push(now);
    return timestamps.length;
  }

  count(key, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = this._store.get(key);
    if (!timestamps) return 0;
    return timestamps.filter((t) => t >= cutoff).length;
  }

  _cleanup() {
    const now = Date.now();
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

const sharedStore = new RateLimitStore();

/**
 * Return the socket IP unless the deployment explicitly declares that it
 * trusts a reverse proxy. This prevents clients from spoofing X-Forwarded-For
 * and bypassing IP-based limits.
 */
function getClientIp(req) {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }

  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function normalizePhone(req) {
  const phone = req.body?.phoneNumber;
  if (phone === undefined || phone === null) return 'unknown';
  const normalized = String(phone).trim();
  return normalized || 'unknown';
}

function applyLimit({ req, res, next, key, maxRequests, windowMs }) {
  const count = sharedStore.hit(key, windowMs);
  const remaining = Math.max(0, maxRequests - count);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Window', `${Math.round(windowMs / 1000)}s`);

  if (count > maxRequests) {
    res.setHeader('Retry-After', String(Math.round(windowMs / 1000)));
    return res.status(429).json({
      success: false,
      status_code: 429,
      message: 'Too many requests. Please try again later.',
      error: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(windowMs / 1000),
    });
  }

  return next();
}

function globalRateLimit(req, res, next) {
  return applyLimit({
    req,
    res,
    next,
    key: `global:${getClientIp(req)}`,
    maxRequests: 100,
    windowMs: 60 * 1000,
  });
}

function strictRateLimit(options = {}) {
  const maxRequests = options.maxRequests || 5;
  const windowMs = options.windowMs || 3 * 60 * 1000;
  const keyFn = options.keyFn || ((req) => `strict:${normalizePhone(req)}:${getClientIp(req)}`);

  return (req, res, next) =>
    applyLimit({
      req,
      res,
      next,
      key: keyFn(req),
      maxRequests,
      windowMs,
    });
}

/**
 * OTP-specific limiter keyed by phone number, independent of IP.
 * This prevents SMS flooding and OTP brute-force attempts through IP rotation.
 */
function phoneRateLimit(options = {}) {
  const maxRequests = options.maxRequests || 5;
  const windowMs = options.windowMs || 3 * 60 * 1000;
  const keyFn = options.keyFn || ((req) => `phone:${normalizePhone(req)}`);

  return (req, res, next) =>
    applyLimit({
      req,
      res,
      next,
      key: keyFn(req),
      maxRequests,
      windowMs,
    });
}

module.exports = {
  globalRateLimit,
  strictRateLimit,
  phoneRateLimit,
  RateLimitStore,
  sharedStore,
  getClientIp,
};

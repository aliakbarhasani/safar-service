'use strict';

/**
 * Rate Limiter Middleware Tests — P9-2
 * تست‌های Unit با Mock کردن Redis
 */

const { createRateLimiter } = require('../middlewares/rate-limiter.middleware');

function createMockRedis(initialCount = 0) {
  let count = initialCount;

  return {
    multi() {
      const operations = [];
      return {
        zremrangebyscore(key, min, max) {
          operations.push({ op: 'zremrangebyscore', key, min, max });
          return this;
        },
        zadd(key, score, member) {
          operations.push({ op: 'zadd', key, score, member });
          return this;
        },
        zcard(key) {
          operations.push({ op: 'zcard', key });
          return this;
        },
        pexpire(key, ms) {
          operations.push({ op: 'pexpire', key, ms });
          return this;
        },
        async exec() {
          return operations.map((op) => {
            if (op.op === 'zcard') return [null, ++count];
            return [null, 1];
          });
        },
      };
    },
  };
}

function createFailingRedis() {
  return {
    multi() {
      return {
        zremrangebyscore() { return this; },
        zadd() { return this; },
        zcard() { return this; },
        pexpire() { return this; },
        async exec() {
          throw new Error('redis unavailable');
        },
      };
    },
  };
}

function createMockReq(ip = '127.0.0.1', user = null) {
  return { ip, user, headers: {} };
}

function createMockRes() {
  const headers = {};
  return {
    headers,
    statusCode: null,
    jsonData: null,
    set(key, value) { headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.jsonData = data; return this; },
  };
}

describe('Rate Limiter Middleware (P9-2)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('should allow first request within limit', async () => {
    const middleware = createRateLimiter({ redisClient: createMockRedis(), maxRequests: 5, windowMs: 60000 });
    const req = createMockReq();
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  test('should block request after exceeding limit', async () => {
    const middleware = createRateLimiter({ redisClient: createMockRedis(10), maxRequests: 5, windowMs: 60000 });
    const req = createMockReq();
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.jsonData.error).toContain('Too Many Requests');
  });

  test('should allow missing Redis outside production', async () => {
    process.env.NODE_ENV = 'test';
    const middleware = createRateLimiter({ redisClient: null, maxRequests: 5 });
    const req = createMockReq();
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  test('should fail closed when Redis is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    const middleware = createRateLimiter({ redisClient: null, maxRequests: 5 });
    const req = createMockReq();
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res.jsonData.error).toBe('Rate limiting service unavailable');
  });

  test('should fail closed when Redis errors in production', async () => {
    process.env.NODE_ENV = 'production';
    const middleware = createRateLimiter({ redisClient: createFailingRedis(), maxRequests: 5 });
    const req = createMockReq();
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  test('should use userId when available', async () => {
    const middleware = createRateLimiter({ redisClient: createMockRedis(), maxRequests: 5, keyPrefix: 'rl:test' });
    const req = createMockReq('127.0.0.1', { userId: 'user-123' });
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  test('should set rate limit headers', async () => {
    const middleware = createRateLimiter({ redisClient: createMockRedis(), maxRequests: 100, windowMs: 60000 });
    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, () => {});

    expect(res.headers['X-RateLimit-Limit']).toBe('100');
    expect(res.headers['X-RateLimit-Remaining']).toBeDefined();
  });

  test('should set Retry-After header on 429', async () => {
    const middleware = createRateLimiter({ redisClient: createMockRedis(999), maxRequests: 5, windowMs: 60000 });
    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, () => {});

    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
  });

  test('should use custom keyGenerator', async () => {
    const middleware = createRateLimiter({
      redisClient: createMockRedis(),
      maxRequests: 5,
      keyGenerator: (req) => req.headers['x-api-key'] || 'anon',
    });
    const req = createMockReq('127.0.0.1');
    req.headers['x-api-key'] = 'my-api-key';
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  test('should use IP when no user', async () => {
    const middleware = createRateLimiter({ redisClient: createMockRedis(), maxRequests: 5 });
    const req = createMockReq('192.168.1.100');
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });
});

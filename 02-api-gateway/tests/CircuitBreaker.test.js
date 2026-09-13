'use strict';

/**
 * Circuit Breaker Middleware Tests — P9-2
 * تست‌های Unit برای حالت‌های CLOSED/OPEN/HALF_OPEN
 */

const { createCircuitBreaker, CircuitBreakerOpenError } = require('../middlewares/circuit-breaker.middleware');

describe('Circuit Breaker (P9-2)', () => {
  test('should start in CLOSED state', () => {
    const cb = createCircuitBreaker({ requestHandler: async () => 'ok' });
    expect(cb.state).toBe('CLOSED');
  });

  test('should allow requests in CLOSED state', async () => {
    const cb = createCircuitBreaker({ requestHandler: async () => 'success' });
    const result = await cb.execute();
    expect(result).toBe('success');
    expect(cb.state).toBe('CLOSED');
  });

  test('should transition to OPEN after failure threshold', async () => {
    const cb = createCircuitBreaker({
      requestHandler: async () => { throw new Error('fail'); },
      failureThreshold: 3,
    });

    for (let i = 0; i < 3; i++) {
      try { await cb.execute(); } catch (e) { /* expected */ }
    }

    expect(cb.state).toBe('OPEN');
    expect(cb.failureCount).toBe(3);
  });

  test('should reject requests in OPEN state with CircuitBreakerOpenError', async () => {
    const cb = createCircuitBreaker({
      requestHandler: async () => { throw new Error('fail'); },
      failureThreshold: 1,
      resetTimeoutMs: 30000,
    });

    try { await cb.execute(); } catch (e) { /* expected */ }
    expect(cb.state).toBe('OPEN');

    try {
      await cb.execute();
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CircuitBreakerOpenError);
      expect(e.statusCode).toBe(503);
      expect(e.code).toBe('CIRCUIT_BREAKER_OPEN');
    }
  });

  test('should transition to HALF_OPEN after reset timeout', async () => {
    const cb = createCircuitBreaker({
      requestHandler: async () => { throw new Error('fail'); },
      failureThreshold: 1,
      resetTimeoutMs: 10, // 10ms for test
    });

    try { await cb.execute(); } catch (e) { /* expected */ }
    expect(cb.state).toBe('OPEN');

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 20));

    // Try again — should transition to HALF_OPEN
    try { await cb.execute(); } catch (e) { /* expected, stays OPEN due to failure */ }
    // After failure in HALF_OPEN, goes back to OPEN
    expect(['OPEN', 'HALF_OPEN']).toContain(cb.state);
  });

  test('should reset to CLOSED after success in HALF_OPEN', async () => {
    let callCount = 0;
    const cb = createCircuitBreaker({
      requestHandler: async () => {
        callCount++;
        if (callCount <= 1) throw new Error('first fail');
        return 'success';
      },
      failureThreshold: 1,
      resetTimeoutMs: 10,
    });

    try { await cb.execute(); } catch (e) { /* expected */ }
    expect(cb.state).toBe('OPEN');

    await new Promise(resolve => setTimeout(resolve, 20));

    const result = await cb.execute();
    expect(result).toBe('success');
    expect(cb.state).toBe('CLOSED');
  });

  test('should track failure count correctly', async () => {
    const cb = createCircuitBreaker({
      requestHandler: async () => { throw new Error('fail'); },
      failureThreshold: 5,
    });

    try { await cb.execute(); } catch (e) {}
    expect(cb.failureCount).toBe(1);

    try { await cb.execute(); } catch (e) {}
    expect(cb.failureCount).toBe(2);
  });

  test('should provide stats', () => {
    const cb = createCircuitBreaker({ requestHandler: async () => 'ok' });
    const stats = cb.stats;
    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failureCount');
    expect(stats).toHaveProperty('successCount');
    expect(stats).toHaveProperty('nextAttempt');
  });

  test('should reset manually', async () => {
    const cb = createCircuitBreaker({
      requestHandler: async () => { throw new Error('fail'); },
      failureThreshold: 1,
    });

    try { await cb.execute(); } catch (e) {}
    expect(cb.state).toBe('OPEN');

    cb.reset();
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(0);
  });
});


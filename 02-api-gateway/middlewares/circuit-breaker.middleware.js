'use strict';

/**
 * Circuit Breaker Middleware — محافظ از سرویس‌های پایین‌دستی
 * حالت‌ها: CLOSED (عادی) → OPEN (قطع) → HALF_OPEN (آزمایشی)
 *
 * @see P9-2: جلوگیری از ارسال درخواست به سرویس‌های از کار افتاده
 */

const { EventEmitter } = require('events');

/**
 * ساخت Circuit Breaker
 * @param {Object} options
 * @param {Function} options.requestHandler — تابع اصلی درخواست (async)
 * @param {number} options.failureThreshold — تعداد خطاهای متوالی برای باز کردن مدار
 * @param {number} options.resetTimeoutMs — زمان انتظار برای حالت HALF_OPEN
 * @param {number} options.halfOpenMaxRequests — حداکثر درخواست در حالت HALF_OPEN
 * @param {Function} options.onStateChange — callback تغییر وضعیت
 */
function createCircuitBreaker(options = {}) {
  const {
    requestHandler,
    failureThreshold = 5,
    resetTimeoutMs = 30000,
    halfOpenMaxRequests = 1,
    onStateChange = null,
  } = options;

  const emitter = new EventEmitter();
  let state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
  let failureCount = 0;
  let successCount = 0;
  let halfOpenRequests = 0;
  let nextAttempt = Date.now();

  const CIRCUIT_BREAKER_STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  };

  /**
   * اجرای درخواست با محافظ Circuit Breaker
   */
  async function execute(...args) {
    if (state === CIRCUIT_BREAKER_STATES.OPEN) {
      if (Date.now() >= nextAttempt) {
        transitionTo(CIRCUIT_BREAKER_STATES.HALF_OPEN);
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN — service unavailable (retry after ${Math.ceil((nextAttempt - Date.now()) / 1000)}s)`,
          { state, nextAttempt }
        );
      }
    }

    if (state === CIRCUIT_BREAKER_STATES.HALF_OPEN && halfOpenRequests >= halfOpenMaxRequests) {
      throw new CircuitBreakerOpenError(
        'Circuit breaker is HALF_OPEN — max concurrent requests reached',
        { state }
      );
    }

    if (state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
      halfOpenRequests++;
    }

    try {
      const result = await requestHandler(...args);
      onSuccess();
      return result;
    } catch (error) {
      onFailure();
      throw error;
    }
  }

  function onSuccess() {
    if (state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
      successCount++;
      halfOpenRequests = Math.max(0, halfOpenRequests - 1);
      if (successCount >= 1) {
        transitionTo(CIRCUIT_BREAKER_STATES.CLOSED);
      }
    }
    failureCount = 0;
  }

  function onFailure() {
    failureCount++;
    if (state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
      transitionTo(CIRCUIT_BREAKER_STATES.OPEN);
    } else if (failureCount >= failureThreshold) {
      transitionTo(CIRCUIT_BREAKER_STATES.OPEN);
    }
  }

  function transitionTo(newState) {
    if (state === newState) return;
    const oldState = state;
    state = newState;

    if (newState === CIRCUIT_BREAKER_STATES.OPEN) {
      nextAttempt = Date.now() + resetTimeoutMs;
      halfOpenRequests = 0;
    } else if (newState === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
      successCount = 0;
      halfOpenRequests = 0;
    } else if (newState === CIRCUIT_BREAKER_STATES.CLOSED) {
      failureCount = 0;
      successCount = 0;
      halfOpenRequests = 0;
    }

    emitter.emit('stateChange', { from: oldState, to: newState, timestamp: Date.now() });
    if (onStateChange) {
      onStateChange(oldState, newState);
    }
  }

  return {
    execute,
    get state() { return state; },
    get failureCount() { return failureCount; },
    get stats() {
      return { state, failureCount, successCount, nextAttempt };
    },
    reset: () => transitionTo(CIRCUIT_BREAKER_STATES.CLOSED),
    emitter,
  };
}

/**
 * خطای مدار باز
 */
class CircuitBreakerOpenError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.statusCode = 503;
    this.code = 'CIRCUIT_BREAKER_OPEN';
    this.details = details;
  }
}

module.exports = {
  createCircuitBreaker,
  CircuitBreakerOpenError,
};

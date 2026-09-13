/**
 * CircuitBreaker.js - State Machine pattern for fault tolerance
 *
 * States:
 *   CLOSED   - Normal operation, requests pass through
 *   OPEN     - Failing, requests short-circuit with fallback
 *   HALF_OPEN - Testing if service recovered
 */

const EventEmitter = require('events');

const STATE = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'default';
    this.fallback = options.fallback || (() => Promise.resolve(null));
    this.failureThreshold = options.failureThreshold ?? 50;
    this.windowMs = options.windowMs ?? 10000;
    this.openMs = options.openMs ?? 30000;
    this.timeoutMs = options.timeoutMs ?? 5000;

    this.state = STATE.CLOSED;
    this._failures = [];
    this._openedAt = null;
    this._halfOpenAttempts = 0;
  }

  async execute(fn) {
    if (this.state === STATE.OPEN) {
      if (this._shouldTryHalfOpen()) {
        this._transitionTo(STATE.HALF_OPEN);
      } else {
        this.emit('short-circuit', { name: this.name, state: this.state });
        return this.fallback();
      }
    }

    if (this.state === STATE.HALF_OPEN && this._halfOpenAttempts >= 1) {
      return this.fallback();
    }

    if (this.state === STATE.HALF_OPEN) {
      this._halfOpenAttempts++;
    }

    try {
      const result = await this._runWithTimeout(fn);
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      if (this.state === STATE.OPEN) {
        this.emit('short-circuit', { name: this.name, state: this.state, error: err.message });
        return this.fallback();
      }
      throw err;
    }
  }

  _runWithTimeout(fn) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CircuitBreaker [${this.name}] timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  _onSuccess() {
    this._halfOpenAttempts = 0;
    if (this.state === STATE.HALF_OPEN) {
      this._transitionTo(STATE.CLOSED);
    }
    this._pruneFailures();
  }

  _onFailure(err) {
    const now = Date.now();
    this._failures.push(now);
    this._pruneFailures();

    if (this.state === STATE.HALF_OPEN) {
      this._transitionTo(STATE.OPEN);
      return;
    }

    if (this.state === STATE.CLOSED) {
      const recentFailures = this._failures.length;
      if (recentFailures >= 3) {
        this._transitionTo(STATE.OPEN);
      }
    }
  }

  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;

    if (newState === STATE.OPEN) {
      this._openedAt = Date.now();
      this._halfOpenAttempts = 0;
      this.emit('state-change', { name: this.name, from: oldState, to: newState });
    } else if (newState === STATE.CLOSED) {
      this._openedAt = null;
      this._failures = [];
      this.emit('state-change', { name: this.name, from: oldState, to: newState });
    } else if (newState === STATE.HALF_OPEN) {
      this.emit('state-change', { name: this.name, from: oldState, to: newState });
    }
  }

  _shouldTryHalfOpen() {
    return this._openedAt && Date.now() - this._openedAt >= this.openMs;
  }

  _pruneFailures() {
    const cutoff = Date.now() - this.windowMs;
    this._failures = this._failures.filter((ts) => ts > cutoff);
  }

  getStatus() {
    this._pruneFailures();
    return {
      name: this.name,
      state: this.state,
      failuresInWindow: this._failures.length,
      openedAt: this._openedAt ? new Date(this._openedAt).toISOString() : null,
    };
  }
}

module.exports = { CircuitBreaker, STATE };
/**
 * Database Pool Validator - PostgreSQL connection health monitor
 *
 * Provides automatic retry/recovery mechanism for PostgreSQL connections.
 * Prevents pricing requests from failing during brief database disconnections.
 * Implements exponential backoff with configurable max retries.
 *
 * Architecture: Clean Architecture - Infrastructure Layer
 * Status: LOCKED | Created v2
 *
 * Dependencies: pg (already in package.json)
 */

const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

class DatabasePoolValidator {
  /**
   * @param {Object} [options] - Configuration overrides
   * @param {number} [options.maxRetries=5] - Maximum connection retry attempts
   * @param {number} [options.baseDelayMs=1000] - Initial retry delay in ms
   * @param {number} [options.maxDelayMs=30000] - Maximum retry delay in ms
   * @param {number} [options.healthCheckIntervalMs=30000] - Health check interval
   */
  constructor(options = {}) {
    this.poolConfig = {
      host: config.pg.host,
      port: config.pg.port,
      database: config.pg.database,
      user: config.pg.user,
      password: config.pg.password,
      max: config.pg.max || 20,
      idleTimeoutMillis: config.pg.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.pg.connectionTimeoutMillis || 5000,
    };

    this.maxRetries = options.maxRetries || 5;
    this.baseDelayMs = options.baseDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 30000;
    this.healthCheckIntervalMs = options.healthCheckIntervalMs || 30000;

    this.pool = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.healthCheckTimer = null;
  }

  /**
   * Initialize the connection pool
   * @returns {Promise<boolean>} True if connection successful
   */
  async initialize() {
    try {
      this.pool = new Pool(this.poolConfig);

      // Test the connection
      const client = await this.pool.connect();
      client.release();

      this.isConnected = true;
      this.retryCount = 0;
      console.log('[DB-Pool] PostgreSQL connection established successfully');

      // Start periodic health checks
      this._startHealthCheck();

      return true;
    } catch (error) {
      console.error('[DB-Pool] Initial connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Execute a database query with automatic retry on failure
   * @param {string} text - SQL query text
   * @param {Array} [params=[]] - Query parameters
   * @param {Object} [options] - Query options
   * @param {number} [options.retries] - Override max retries for this query
   * @returns {Promise<Object>} Query result
   * @throws {Error} After exhausting all retry attempts
   */
  async query(text, params = [], options = {}) {
    const maxRetries = options.retries !== undefined ? options.retries : this.maxRetries;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.pool || !this.isConnected) {
          await this._attemptRecovery();
        }

        const result = await this.pool.query(text, params);

        // Reset retry count on success
        this.retryCount = 0;

        return result;
      } catch (error) {
        lastError = error;

        // Don't retry if it's a logic error (not connection error)
        if (this._isLogicError(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = this._calculateDelay(attempt);
          console.warn(
            `[DB-Pool] Query failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}. Retrying in ${delay}ms...`
          );
          await this._sleep(delay);
        }
      }
    }

    this.isConnected = false;
    throw new Error(
      `[DB-Pool] Query failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`
    );
  }

  /**
   * Get a client from the pool for transactions
   * @returns {Promise<Object>} Database client
   */
  async getClient() {
    if (!this.pool || !this.isConnected) {
      await this._attemptRecovery();
    }
    return this.pool.connect();
  }

  /**
   * Check database health
   * @returns {Promise<boolean>} True if database is healthy
   */
  async healthCheck() {
    try {
      if (!this.pool) return false;
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      this.isConnected = true;
      return true;
    } catch (error) {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Gracefully shutdown the connection pool
   */
  async shutdown() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('[DB-Pool] Connection pool closed');
    }
  }

  /**
   * Attempt to recover a broken connection
   * @returns {Promise<void>}
   * @private
   */
  async _attemptRecovery() {
    this.retryCount++;
    const delay = this._calculateDelay(this.retryCount - 1);

    console.log(`[DB-Pool] Attempting recovery (attempt ${this.retryCount})...`);

    await this._sleep(delay);

    try {
      if (this.pool) {
        await this.pool.end().catch(() => {});
      }
      this.pool = new Pool(this.poolConfig);
      const client = await this.pool.connect();
      client.release();
      this.isConnected = true;
      this.retryCount = 0;
      console.log('[DB-Pool] Recovery successful');
    } catch (error) {
      this.isConnected = false;
      console.error(`[DB-Pool] Recovery failed: ${error.message}`);
      throw new Error(`Database recovery failed after ${this.retryCount} attempts: ${error.message}`);
    }
  }

  /**
   * Start periodic health check
   * @private
   */
  _startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.healthCheckTimer = setInterval(async () => {
      await this.healthCheck();
    }, this.healthCheckIntervalMs);

    // Allow the timer to not block process exit
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   * @private
   */
  _calculateDelay(attempt) {
    const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt), this.maxDelayMs);
    // Add jitter ((pm 20%))
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.round(delay + jitter);
  }

  /**
   * Determine if an error is a logic error (not connection-related)
   * @param {Error} error - The error to check
   * @returns {boolean}
   * @private
   */
  _isLogicError(error) {
    const connectionErrors = [
      'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
      'Connection terminated', 'Client has encountered',
      'socket', 'timeout',
    ];
    const msg = error.message.toLowerCase();
    return !connectionErrors.some(e => msg.includes(e.toLowerCase()));
  }

  /**
   * Promise-based sleep
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DatabasePoolValidator;

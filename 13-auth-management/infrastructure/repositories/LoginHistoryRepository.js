const { Pool } = require('pg');

/**
 * LoginHistoryRepository
 * Persists login attempts (success/failure) to the `login_history` table.
 * Falls back to in-memory store when PostgreSQL is unavailable.
 */
class LoginHistoryRepository {
  constructor() {
    this.pool = null;
    this.inMemoryStore = [];
    this._initPool();
  }

  _initPool() {
    try {
      this.pool = new Pool({
        host: process.env.PG_HOST || '127.0.0.1',
        port: parseInt(process.env.PG_PORT, 10) || 5432,
        database: process.env.PG_DATABASE || 'safar_service',
        user: process.env.PG_USER || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
        password: process.env.PG_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } catch (err) {
      console.warn('[LoginHistoryRepository] PostgreSQL init failed:', err.message);
      this.pool = null;
    }
  }

  async _isDBReady() {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record a login attempt.
   * @param {Object} entry - { userId, phoneNumber, loginType, status, ipAddress, userAgent, failureReason }
   */
  async record(entry) {
    const {
      userId = null,
      phoneNumber,
      loginType = 'otp',
      status = 'success',
      ipAddress = null,
      userAgent = null,
      failureReason = null,
    } = entry;

    if (await this._isDBReady()) {
      try {
        await this.pool.query(
          `INSERT INTO login_history
            (user_id, phone_number, login_type, status, ip_address, user_agent, failure_reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [userId, phoneNumber, loginType, status, ipAddress, userAgent, failureReason]
        );
        return true;
      } catch (err) {
        console.warn('[LoginHistoryRepository] DB record failed:', err.message);
      }
    }

    // In-memory fallback
    this.inMemoryStore.push({
      userId,
      phoneNumber,
      loginType,
      status,
      ipAddress,
      userAgent,
      failureReason,
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  /**
   * Get recent login attempts for a phone number.
   * @param {string} phoneNumber
   * @param {number} limit
   */
  async findByPhoneNumber(phoneNumber, limit = 10) {
    if (await this._isDBReady()) {
      try {
        const result = await this.pool.query(
          `SELECT id, user_id, phone_number, login_type, status, ip_address, user_agent, failure_reason, created_at
           FROM login_history
           WHERE phone_number = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [phoneNumber, limit]
        );
        return result.rows;
      } catch (err) {
        console.warn('[LoginHistoryRepository] DB query failed:', err.message);
      }
    }

    return this.inMemoryStore
      .filter((e) => e.phoneNumber === phoneNumber)
      .slice(-limit)
      .reverse();
  }

  /**
   * Count failed attempts for a phone number within a time window.
   * @param {string} phoneNumber
   * @param {number} windowMinutes
   */
  async countFailedAttempts(phoneNumber, windowMinutes = 15) {
    if (await this._isDBReady()) {
      try {
        const result = await this.pool.query(
          `SELECT COUNT(*) as count
           FROM login_history
           WHERE phone_number = $1 AND status = 'failed' AND created_at >= NOW() - ($2 || ' minutes')::INTERVAL`,
          [phoneNumber, String(windowMinutes)]
        );
        return parseInt(result.rows[0].count, 10);
      } catch (err) {
        console.warn('[LoginHistoryRepository] DB count failed:', err.message);
      }
    }

    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    return this.inMemoryStore.filter(
      (e) => e.phoneNumber === phoneNumber && e.status === 'failed' && new Date(e.createdAt).getTime() >= cutoff
    ).length;
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = LoginHistoryRepository;
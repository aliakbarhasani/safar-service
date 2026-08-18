const { Pool } = require('pg');

class SessionRepository {
  constructor() {
    this.pool = null;
    this._initPool();
  }

  _initPool() {
    try {
      this.pool = new Pool({
        host: process.env.PG_HOST || '127.0.0.1',
        port: parseInt(process.env.PG_PORT, 10) || 5432,
        database: process.env.PG_DATABASE || 'safar_service',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'postgres',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } catch (err) {
      console.warn('[SessionRepository] PostgreSQL init failed:', err.message);
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

  async createSession(sessionData) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const { userId, phoneNumber, accessTokenJti, refreshToken, role, expiresAt } = sessionData;

    const result = await this.pool.query(
      `INSERT INTO user_sessions
        (user_id, phone_number, token, refresh_token, role, is_active, expires_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       RETURNING id, user_id, phone_number, role, is_active, expires_at, created_at`,
      [userId, phoneNumber, accessTokenJti, refreshToken, role || 'passenger', expiresAt]
    );

    return result.rows[0];
  }

  async findById(sessionId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    const result = await this.pool.query(
      'SELECT id, user_id, phone_number, role, is_active, expires_at, created_at FROM user_sessions WHERE id = $1 LIMIT 1',
      [sessionId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async findActiveByUser(userId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return [];

    const result = await this.pool.query(
      `SELECT id, user_id, phone_number, token, refresh_token, role, is_active, expires_at, created_at
       FROM user_sessions
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  async revokeSession(sessionId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    await this.pool.query(
      'UPDATE user_sessions SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [sessionId]
    );
  }

  async revokeAllUserSessions(userId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    await this.pool.query(
      'UPDATE user_sessions SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );
  }

  async rotateRefreshToken(sessionId, newRefreshToken, newAccessTokenJti) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    await this.pool.query(
      `UPDATE user_sessions
       SET token = $1, refresh_token = $2, updated_at = NOW()
       WHERE id = $3`,
      [newAccessTokenJti, newRefreshToken, sessionId]
    );
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = SessionRepository;
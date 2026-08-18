const { Pool } = require('pg');

class ProfileRepository {
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
      console.warn('[ProfileRepository] PostgreSQL init failed:', err.message);
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

  async findProfileByUserId(userId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    const result = await this.pool.query(
      `SELECT user_id, first_name, last_name, email, avatar_url, national_code, document_status, created_at, updated_at
       FROM user_profiles
       WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async createProfile(data) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const { userId, firstName, lastName, email, avatarUrl, nationalCode } = data;

    const result = await this.pool.query(
      `INSERT INTO user_profiles (user_id, first_name, last_name, email, avatar_url, national_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, first_name, last_name, email, avatar_url, national_code, document_status, created_at`,
      [userId, firstName, lastName, email, avatarUrl, nationalCode]
    );

    return result.rows[0];
  }

  async updateProfile(userId, updates) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const allowedFields = ['first_name', 'last_name', 'email', 'avatar_url', 'national_code'];
    const setClause = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key === 'firstName' ? 'first_name' :
                    key === 'lastName' ? 'last_name' :
                    key === 'avatarUrl' ? 'avatar_url' :
                    key === 'nationalCode' ? 'national_code' : key;
      
      if (allowedFields.includes(dbKey)) {
        setClause.push(`${dbKey} = $${idx++}`);
        values.push(value);
      }
    }

    if (setClause.length === 0) return null;

    values.push(userId);
    const query = `UPDATE user_profiles SET ${setClause.join(', ')}, updated_at = NOW() WHERE user_id = $${idx} RETURNING user_id, first_name, last_name, email, avatar_url, national_code, document_status, updated_at`;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async findSettingsByUserId(userId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    const result = await this.pool.query(
      'SELECT user_id, language, currency, country, timezone, notifications_enabled, created_at, updated_at FROM user_settings WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async createSettings(data) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const { userId, language, currency, country, timezone, notificationsEnabled } = data;

    const result = await this.pool.query(
      `INSERT INTO user_settings (user_id, language, currency, country, timezone, notifications_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, language, currency, country, timezone, notifications_enabled, created_at`,
      [userId, language, currency, country, timezone, notificationsEnabled]
    );

    return result.rows[0];
  }

  async updateSettings(userId, updates) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const allowedFields = ['language', 'currency', 'country', 'timezone', 'notifications_enabled'];
    const setClause = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key === 'notificationsEnabled' ? 'notifications_enabled' : key;
      
      if (allowedFields.includes(dbKey)) {
        setClause.push(`${dbKey} = $${idx++}`);
        values.push(value);
      }
    }

    if (setClause.length === 0) return null;

    values.push(userId);
    const query = `UPDATE user_settings SET ${setClause.join(', ')}, updated_at = NOW() WHERE user_id = $${idx} RETURNING user_id, language, currency, country, timezone, notifications_enabled, updated_at`;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = ProfileRepository;
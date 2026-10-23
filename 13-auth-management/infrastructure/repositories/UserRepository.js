const { Pool } = require('pg');
const { getPhoneNumberLookupCandidates } = require('../../domain/services/PhoneNumber');

class UserRepository {
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
        user: process.env.PG_USER || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
        password: process.env.PG_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } catch (err) {
      console.warn('[UserRepository] PostgreSQL pool init failed:', err.message);
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

  async findByPhoneNumber(phoneNumber) {
    const candidates = getPhoneNumberLookupCandidates(phoneNumber);
    if (candidates.length === 0) return null;

    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    const result = await this.pool.query(
      `SELECT id, phone_number, first_name, last_name, email, role, status, created_at
       FROM users
       WHERE phone_number = ANY($1::text[]) AND deleted_at IS NULL
       ORDER BY array_position($1::text[], phone_number::text) ASC
       LIMIT 1`,
      [candidates]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async findByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const result = await this.pool.query(
      `SELECT id, phone_number, first_name, last_name, email, password_hash, role, status, is_email_verified, created_at
       FROM users
       WHERE LOWER(BTRIM(email)) = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [normalizedEmail]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async findById(id) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    const result = await this.pool.query(
      `SELECT id, phone_number, first_name, last_name, email, role, status, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async create(userData) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const {
      phoneNumber,
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      status = 'active',
      countryId = null,
      preferredCurrencyId = null,
      avatarUrl = null,
      isPhoneVerified = false,
      isEmailVerified = false,
    } = userData;

    const result = await this.pool.query(
      `INSERT INTO users
        (phone_number, first_name, last_name, email, password_hash, role, status,
         country_id, preferred_currency_id, avatar_url, is_phone_verified, is_email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, phone_number, first_name, last_name, email, role, status, created_at`,
      [
        phoneNumber,
        firstName,
        lastName,
        email ? String(email).trim().toLowerCase() : null,
        passwordHash,
        role,
        status,
        countryId,
        preferredCurrencyId,
        avatarUrl,
        isPhoneVerified,
        isEmailVerified,
      ]
    );

    return result.rows[0];
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = UserRepository;
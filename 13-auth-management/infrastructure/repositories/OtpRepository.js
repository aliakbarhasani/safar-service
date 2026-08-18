const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const OtpCode = require('../../domain/entities/OtpCode');

class OtpRepository {
  constructor() {
    this.pool = null;
    this.inMemoryStore = new Map();
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
      console.warn('[OtpRepository] PostgreSQL init failed:', err.message);
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

  async hashCode(plainCode) {
    return bcrypt.hash(plainCode, 10);
  }

  async save(phoneNumber, codeHash, expiresAt, type = 'login') {
    const key = `${phoneNumber}:${type}`;

    if (await this._isDBReady()) {
      try {
        await this.pool.query(
          `INSERT INTO otp_codes
            (phone_number, code_hash, type, expires_at, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (phone_number, type) DO UPDATE
           SET code_hash = $2, expires_at = $4, is_used = FALSE, attempts = 0, updated_at = NOW()`,
          [phoneNumber, codeHash, type, expiresAt]
        );
        return { phoneNumber, type };
      } catch (err) {
        console.warn('[OtpRepository] DB save failed, using memory:', err.message);
      }
    }

    this.inMemoryStore.set(key, {
      phoneNumber,
      codeHash,
      type,
      expiresAt,
      isUsed: false,
      attempts: 0,
      maxAttempts: 5,
    });
    return { phoneNumber, type };
  }

  async findByPhoneNumber(phoneNumber, type = 'login') {
    const key = `${phoneNumber}:${type}`;
    const dbReady = await this._isDBReady();

    if (dbReady) {
      try {
        const result = await this.pool.query(
          `SELECT id, phone_number, code_hash, type, expires_at, is_used, attempts, max_attempts, created_at, updated_at
           FROM otp_codes
           WHERE phone_number = $1 AND type = $2
           ORDER BY created_at DESC LIMIT 1`,
          [phoneNumber, type]
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          return new OtpCode({
            id: row.id,
            phoneNumber: row.phone_number,
            codeHash: row.code_hash,
            type: row.type,
            expiresAt: row.expires_at,
            isUsed: row.is_used,
            attempts: row.attempts,
            maxAttempts: row.max_attempts,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        }
      } catch (err) {
        console.warn('[OtpRepository] DB lookup failed, using memory:', err.message);
      }
    }

    // Fallback to in-memory store
    const entry = this.inMemoryStore.get(key);
    if (!entry) return null;
    return new OtpCode({
      phoneNumber: entry.phoneNumber,
      codeHash: entry.codeHash,
      type: entry.type,
      expiresAt: entry.expiresAt,
      isUsed: entry.isUsed,
      attempts: entry.attempts,
      maxAttempts: entry.maxAttempts || 5,
    });
  }

  async incrementAttempt(phoneNumber, type = 'login') {
    const key = `${phoneNumber}:${type}`;

    if (await this._isDBReady()) {
      try {
        await this.pool.query(
          `UPDATE otp_codes SET attempts = attempts + 1, updated_at = NOW()
           WHERE phone_number = $1 AND type = $2`,
          [phoneNumber, type]
        );
        return;
      } catch (err) {
        console.warn('[OtpRepository] DB increment failed:', err.message);
      }
    }

    const entry = this.inMemoryStore.get(key);
    if (entry) {
      entry.attempts = (entry.attempts || 0) + 1;
    }
  }

  async markUsed(phoneNumber, type = 'login') {
    if (await this._isDBReady()) {
      try {
        await this.pool.query(
          `UPDATE otp_codes SET is_used = TRUE, verified_at = NOW(), updated_at = NOW()
           WHERE phone_number = $1 AND type = $2`,
          [phoneNumber, type]
        );
        return;
      } catch (err) {
        console.warn('[OtpRepository] DB markUsed failed:', err.message);
      }
    }

    const entry = this.inMemoryStore.get(key);
    if (entry) {
      entry.isUsed = true;
    }
  }

  async delete(phoneNumber, type = 'login') {
    const key = `${phoneNumber}:${type}`;

    if (await this._isDBReady()) {
      try {
        await this.pool.query(
          'DELETE FROM otp_codes WHERE phone_number = $1 AND type = $2',
          [phoneNumber, type]
        );
        return;
      } catch (err) {
        console.warn('[OtpRepository] DB delete failed:', err.message);
      }
    }

    this.inMemoryStore.delete(key);
  }

  async getAttemptCount(phoneNumber, type = 'login') {
    const key = `${phoneNumber}:${type}`;
    const otp = await this.findByPhoneNumber(phoneNumber, type);
    return otp ? otp.attempts : 0;
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = OtpRepository;
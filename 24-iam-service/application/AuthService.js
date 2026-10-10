'use strict';

/**
 * AuthService.js - IAM Service (P11-1)
 *
 * صادرکننده‌ی توکن (Token Issuer) با الگوی Access+Refresh:
 *   - Access Token  : JWT امضاشده با RSA-2048 / RS256، انقضای ۱۵ دقیقه.
 *   - Refresh Token : رشته‌ی اتفاقی (crypto.randomBytes) — در Redis
 *                     همراه userId و role با انقضای ۷ روز ذخیره می‌شود.
 *
 * SECURITY: IAM و همه‌ی مصرف‌کنندگان داخلی باید از زوج کلید مرکزی پروژه
 * در 00-infrastructure/keys استفاده کنند تا یک Access Token در سرویس‌های
 * مختلف با کلیدهای متفاوت رد نشود.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 دقیقه
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 روز
const REFRESH_PREFIX = 'iam:refresh:';
const CENTRAL_KEYS_DIR = path.resolve(__dirname, '../../00-infrastructure/keys');
const DEFAULT_PRIVATE_KEY_PATH = path.join(CENTRAL_KEYS_DIR, 'jwt_private.pem');
const DEFAULT_PUBLIC_KEY_PATH = path.join(CENTRAL_KEYS_DIR, 'jwt_public.pem');

class AuthService {
  /**
   * @param {Object} deps
   * @param {string} [deps.privateKeyPath] - مسیر کلید خصوصی RSA PKCS8؛ پیش‌فرض کلید مرکزی پروژه
   * @param {Object} [deps.redis]          - کلاینت Redis (set/get/del با الگوی ioredis)
   * @param {string} [deps.issuer]         - ایسیویی (پیش‌فرض safar-iam)
   * @param {number} [deps.accessTtl]      - انقضای Access (ثانیه)
   * @param {number} [deps.refreshTtl]     - انقضای Refresh (ثانیه)
   */
  constructor({ privateKeyPath = DEFAULT_PRIVATE_KEY_PATH, redis = null, issuer = 'safar-iam', accessTtl = ACCESS_TOKEN_TTL_SECONDS, refreshTtl = REFRESH_TOKEN_TTL_SECONDS } = {}) {
    this.issuer = issuer;
    this.accessTtl = accessTtl;
    this.refreshTtl = refreshTtl;
    this.redis = redis;
    this.privateKeyPath = privateKeyPath;
    this.privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
  }

  /**
   * صادرکردن جفت توکن (Access + Refresh) برای یک کاربر.
   * @param {string} userId
   * @param {string} role
   * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number, tokenType: string }>}
   */
  async login(userId, role) {
    if (!userId) {
      const err = new Error('userId is required for login');
      err.code = 'MISSING_USER_ID';
      err.statusCode = 400;
      throw err;
    }

    const accessToken = this._issueAccessToken(userId, role);
    const refreshToken = this._generateRefreshToken();

    await this._storeRefreshToken(userId, role, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl,
      tokenType: 'Bearer',
    };
  }

  /**
   * چرخش Refresh Token: در صورت صحت توکن قدیمی، آن را باطل کرده و جفت جدید صادر می‌کند.
   * @param {string} oldRefreshToken
   * @returns {Promise<{ accessToken, refreshToken, userId, expiresIn, tokenType }>}
   */
  async refreshToken(oldRefreshToken) {
    if (!oldRefreshToken) {
      const err = new Error('refreshToken is required');
      err.code = 'MISSING_REFRESH_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    // Consume the refresh token atomically. A GET followed by DEL allows two
    // concurrent refresh requests to both observe the same token and mint two
    // valid sessions. Redis Lua makes lookup + revocation one indivisible step.
    const record = await this._consumeRefreshToken(oldRefreshToken);
    if (!record) {
      const err = new Error('Invalid or expired refresh token');
      err.code = 'INVALID_REFRESH_TOKEN';
      err.statusCode = 401;
      throw err;
    }

    const accessToken = this._issueAccessToken(record.userId, record.role);
    const newRefreshToken = this._generateRefreshToken();
    await this._storeRefreshToken(record.userId, record.role, newRefreshToken);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      userId: record.userId,
      expiresIn: this.accessTtl,
      tokenType: 'Bearer',
    };
  }

  /** کلید عمومی مرکزی برای وریفای Stateless در سرویس‌های مصرف‌کننده. */
  static getPublicKeyPath() {
    return DEFAULT_PUBLIC_KEY_PATH;
  }

  // ---- داخلی‌ها ----

  _issueAccessToken(userId, role) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: String(userId),
      role: role || 'user',
      iat: now,
      exp: now + this.accessTtl,
      iss: this.issuer,
      type: 'access',
    };
    return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
  }

  _generateRefreshToken() {
    return crypto.randomBytes(48).toString('base64url');
  }

  async _storeRefreshToken(userId, role, refreshToken) {
    if (!this.redis) return;
    const record = JSON.stringify({ userId, role: role || 'user' });
    await this.redis.set(`${REFRESH_PREFIX}${refreshToken}`, record, 'EX', this.refreshTtl);
  }

  async _consumeRefreshToken(refreshToken) {
    if (!this.redis || typeof this.redis.eval !== 'function') {
      // Fail closed rather than use a non-atomic GET/DEL fallback.
      const err = new Error('Atomic refresh-token storage is not configured');
      err.code = 'REFRESH_TOKEN_STORAGE_UNAVAILABLE';
      err.statusCode = 503;
      throw err;
    }

    const key = `${REFRESH_PREFIX}${refreshToken}`;
    const raw = await this.redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      key,
    );
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }
}

module.exports = {
  AuthService,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_PREFIX,
  DEFAULT_PRIVATE_KEY_PATH,
  DEFAULT_PUBLIC_KEY_PATH,
};

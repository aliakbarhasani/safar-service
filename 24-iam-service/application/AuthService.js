'use strict';

/**
 * AuthService.js - IAM Service (P11-1)
 *
 * صادرکننده‌ی توکن (Token Issuer) با الگوی Access+Refresh:
 *   - Access Token  : JWT امضاشده با RSA-2048 / RS256، انقضای ۱۵ دقیقه.
 *   - Refresh Token : رشته‌ی اتفاقی (crypto.randomBytes) — بدون امضا؛ در Redis
 *                     همراه userId با انقضای ۷ روز ذخیره می‌شود.
 *
 * وریفای Stateless در Gateway با کلید عمومی انجام می‌شود (فایل jwt_public.pem).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 دقیقه
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 روز
const REFRESH_PREFIX = 'iam:refresh:';

class AuthService {
  /**
   * @param {Object} deps
   * @param {string} [deps.privateKeyPath] - مسیر کلید خصوصی (RSA PKCS8 PEM)
   * @param {Object} [deps.redis]          - کلاینت Redis (set/get/del با الگوی ioredis)
   * @param {string} [deps.issuer]         - ایسیویی (پیش‌فرض safar-iam)
   * @param {number} [deps.accessTtl]      - انقضای Access (ثانیه)
   * @param {number} [deps.refreshTtl]     - انقضای Refresh (ثانیه)
   */
  constructor({ privateKeyPath = null, redis = null, issuer = 'safar-iam', accessTtl = ACCESS_TOKEN_TTL_SECONDS, refreshTtl = REFRESH_TOKEN_TTL_SECONDS } = {}) {
    this.issuer = issuer;
    this.accessTtl = accessTtl;
    this.refreshTtl = refreshTtl;
    this.redis = redis;

    const resolvedKeyPath = privateKeyPath || path.resolve(__dirname, '..', '..', '00-infrastructure', 'keys', 'jwt_private.pem');
    this.privateKey = fs.readFileSync(resolvedKeyPath, 'utf8');
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

    // ذخیره Refresh Token همراه userId (انقضای ۷ روز)
    await this._storeRefreshToken(userId, refreshToken);

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

    const record = await this._lookupRefreshToken(oldRefreshToken);
    if (!record) {
      const err = new Error('Invalid or expired refresh token');
      err.code = 'INVALID_REFRESH_TOKEN';
      err.statusCode = 401;
      throw err;
    }

    // باطل‌کردن توکن قدیمی (حلقه چرخش محدود نیست در این فاز؛ حذف صورت ساده)
    await this._revokeRefreshToken(oldRefreshToken);

    const accessToken = this._issueAccessToken(record.userId, record.role);
    const newRefreshToken = this._generateRefreshToken();
    await this._storeRefreshToken(record.userId, newRefreshToken);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      userId: record.userId,
      expiresIn: this.accessTtl,
      tokenType: 'Bearer',
    };
  }

  /** البته کلید عمومی را برای وریفای در Gateway (متد کمکی). */
  static getPublicKeyPath() {
    return path.resolve(__dirname, '..', '..', '00-infrastructure', 'keys', 'jwt_public.pem');
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

  async _storeRefreshToken(userId, refreshToken) {
    if (!this.redis) return; // در نبود Redis، عدم ذخیره (فاز تست)
    const record = JSON.stringify({ userId, role: 'passenger' });
    await this.redis.set(`${REFRESH_PREFIX}${refreshToken}`, record, 'EX', this.refreshTtl);
  }

  async _lookupRefreshToken(refreshToken) {
    if (!this.redis) return null;
    const raw = await this.redis.get(`${REFRESH_PREFIX}${refreshToken}`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  async _revokeRefreshToken(refreshToken) {
    if (this.redis) await this.redis.del(`${REFRESH_PREFIX}${refreshToken}`);
  }
}

module.exports = { AuthService, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, REFRESH_PREFIX };
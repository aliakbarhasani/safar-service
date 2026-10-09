const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../../14-config-system/server.config');

class JwtService {
  constructor() {
    this.privateKeyPath = path.resolve(__dirname, '../../../00-infrastructure/keys/jwt_private.pem');
    this.publicKeyPath = path.resolve(__dirname, '../../../00-infrastructure/keys/jwt_public.pem');
    this.privateKey = null;
    this.publicKey = null;
    this._loadKeys();

    // پشتیبانی از کلید خصوصی رمزدار: رمز فقط از محیط خوانده می‌شود (هرگز در مخزن).
    this.privateKeyPassphrase = (process.env.JWT_PRIVATE_KEY_PASSPHRASE || '').trim();
    this.signingKey = this.privateKeyPassphrase
      ? { key: this.privateKey, passphrase: this.privateKeyPassphrase }
      : this.privateKey;
  }

  _loadKeys() {
    try {
      this.privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
      this.publicKey = fs.readFileSync(this.publicKeyPath, 'utf8');
    } catch (err) {
      console.error('[JwtService] Failed to load RSA keys:', err.message);
      throw new Error('JWT keys not found. Please generate them first.');
    }
  }

  generateAccessToken(user) {
    const payload = {
      userId: user.id,
      phoneNumber: user.phoneNumber || user.phone_number,
      role: user.role,
      type: 'access',
    };

    return jwt.sign(payload, this.signingKey, {
      algorithm: 'RS256',
      issuer: 'safar-iam',
      expiresIn: '15m',
      jwtid: `access-${crypto.randomUUID()}`,
    });
  }

  generateRefreshToken(user) {
    const payload = {
      userId: user.id,
      phoneNumber: user.phoneNumber || user.phone_number,
      role: user.role,
      type: 'refresh',
      jti: `refresh-${crypto.randomUUID()}`,
    };

    return jwt.sign(payload, this.signingKey, {
      algorithm: 'RS256',
      issuer: 'safar-iam',
      expiresIn: '7d',
    });
  }

  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (err) {
      throw new Error('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (err) {
      throw new Error('Invalid or expired refresh token');
    }
  }
}

module.exports = JwtService;

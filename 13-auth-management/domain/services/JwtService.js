const jwt = require('jsonwebtoken');
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
  }

  _loadKeys() {
    try {
      this.privateKey = fs.readFileSync(this.privateKeyPath, 'utf-8');
      this.publicKey = fs.readFileSync(this.publicKeyPath, 'utf-8');
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

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: '15m',
      // jti یکتا برای ابطال نشست (Logout) از طریق user_sessions.token
      jwtid: `access-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  generateRefreshToken(user) {
    const payload = {
      userId: user.id,
      phoneNumber: user.phoneNumber || user.phone_number,
      role: user.role,
      type: 'refresh',
      jti: `refresh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
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
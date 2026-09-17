const jwt = require('jsonwebtoken');

/**
 * JWT service
 *
 * RS256 is the only supported JWT algorithm.
 * Keys are supplied by environment variables and are never read from
 * tracked repository files.
 */
class JwtService {
  constructor() {
    this.privateKey = this._readKey('JWT_PRIVATE_KEY');
    this.publicKey = this._readKey('JWT_PUBLIC_KEY');
    this.privateKeyPassphrase = process.env.JWT_PRIVATE_KEY_PASSPHRASE || '';
    this.signingKey = this.privateKeyPassphrase
      ? { key: this.privateKey, passphrase: this.privateKeyPassphrase }
      : this.privateKey;
  }

  _readKey(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
      throw new Error(`${name} is not configured`);
    }

    // Supports both real multiline environment values and values stored with
    // escaped newlines (for example in a .env file).
    return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
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
      expiresIn: '15m',
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

    return jwt.sign(payload, this.signingKey, {
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

const JwtService = require('./JwtService');
const SessionRepository = require('../../infrastructure/repositories/SessionRepository');

class SessionManager {
  constructor({ jwtService = null, sessionRepository = null } = {}) {
    this.jwtService = jwtService || new JwtService();
    this.sessionRepository = sessionRepository || new SessionRepository();
  }

  async createSession(user, deviceInfo = {}) {
    const refreshToken = this.jwtService.generateRefreshToken(user);
    const accessToken = this.jwtService.generateAccessToken(user);
    const accessTokenJti = require('jsonwebtoken').decode(accessToken, { complete: true }).payload.jti || `access-${Date.now()}`;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await this.sessionRepository.createSession({
      userId: user.id,
      phoneNumber: user.phoneNumber || user.phone_number,
      accessTokenJti,
      refreshToken,
      role: user.role,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      refreshExpiresAt: expiresAt.toISOString(),
      sessionId: session.id,
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber || user.phone_number,
        role: user.role,
      },
    };
  }

  async refreshSession(refreshToken) {
    const decoded = this.jwtService.verifyRefreshToken(refreshToken);

    const sessions = await this.sessionRepository.findActiveByUser(decoded.userId);
    const session = sessions.find(s => s.refresh_token === refreshToken);

    if (!session) {
      throw new Error('Invalid refresh token');
    }

    if (!session.is_active) {
      throw new Error('Session has been revoked');
    }

    const user = {
      id: decoded.userId,
      phoneNumber: decoded.phoneNumber,
      role: decoded.role,
    };

    const newRefreshToken = this.jwtService.generateRefreshToken(user);
    const newAccessToken = this.jwtService.generateAccessToken(user);
    const newAccessTokenJti = require('jsonwebtoken').decode(newAccessToken, { complete: true }).payload.jti || `access-${Date.now()}`;

    await this.sessionRepository.rotateRefreshToken(
      session.id,
      refreshToken,
      newRefreshToken,
      newAccessTokenJti
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
      sessionId: session.id,
      user,
    };
  }

  async revokeSession(sessionId) {
    await this.sessionRepository.revokeSession(sessionId);
  }

  /**
   * ابطال نشست بر اساس Access Token (jti آن در ستون token ذخیره می‌شود).
   * شناسه نشست ابطال‌شده را برمی‌گرداند یا null.
   */
  async revokeByAccessToken(accessToken) {
    const decoded = require('jsonwebtoken').decode(accessToken, { complete: true });
    const jti = decoded && decoded.payload ? decoded.payload.jti : null;
    if (!jti) return null;
    return this.sessionRepository.revokeByAccessTokenJti(jti);
  }

  async revokeAllUserSessions(userId) {
    await this.sessionRepository.revokeAllUserSessions(userId);
  }
}

module.exports = SessionManager;
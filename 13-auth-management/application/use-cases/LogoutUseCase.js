/**
 * Logout Use Case - ابطال نشست کاربر (Session Revocation)
 *
 * Access Token را دریافت و نشست متناظر (بر اساس jti ذخیره‌شده در
 * جدول user_sessions) را غیرفعال می‌کند. در نبود دیتابیس، خطا
 * نمی‌پرد تا خروج کلاینت هرگز شکست نخورد (fail-open برای logout).
 */
class LogoutUseCase {
  constructor({ sessionManager = null } = {}) {
    const SessionManager = require('../../domain/services/SessionManager');
    this.sessionManager = sessionManager || new SessionManager();
  }

  async execute(accessToken) {
    if (!accessToken) {
      return { revoked: false, sessionId: null, message: 'No token provided' };
    }

    try {
      const sessionId = await this.sessionManager.revokeByAccessToken(accessToken);
      return {
        revoked: Boolean(sessionId),
        sessionId: sessionId || null,
        message: sessionId ? 'Session revoked successfully' : 'No active session found for token',
      };
    } catch (err) {
      console.warn('[LogoutUseCase] Session revocation failed:', err.message);
      return { revoked: false, sessionId: null, message: 'Session revocation skipped (storage unavailable)' };
    }
  }
}

module.exports = LogoutUseCase;
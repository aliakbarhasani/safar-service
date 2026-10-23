const EmailPasswordLoginUseCase = require('../../application/use-cases/EmailPasswordLoginUseCase');

class EmailAuthController {
  constructor(loginUseCase = null) {
    this.loginUseCase = loginUseCase || new EmailPasswordLoginUseCase();
  }

  async login(req, res) {
    const { email, password } = req.body || {};
    const meta = {
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.socket?.remoteAddress || null,
    };
    try {
      const result = await this.loginUseCase.execute(email, password, meta);
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60 * 1000,
      });
      return res.status(200).json({
        success: true,
        status_code: 200,
        message: 'Login successful',
        data: { user: result.user, sessionId: result.sessionId },
      });
    } catch (error) {
      const statusCode = Number(error.statusCode) || (error.code === 'AUTH_SESSION_UNAVAILABLE' ? 503 : 401);
      return res.status(statusCode).json({
        success: false,
        status_code: statusCode,
        message: error.message || 'Login failed',
      });
    }
  }
}

module.exports = EmailAuthController;

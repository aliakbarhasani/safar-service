const { extractAccessToken } = require('../middleware/auth.middleware');
const RequestOtpUseCase = require('../../application/use-cases/RequestOtpUseCase');
const VerifyOtpUseCase = require('../../application/use-cases/VerifyOtpUseCase');
const RecordLoginHistoryUseCase = require('../../application/use-cases/RecordLoginHistoryUseCase');
const RecordAuditLogUseCase = require('../../application/use-cases/RecordAuditLogUseCase');
const LogoutUseCase = require('../../application/use-cases/LogoutUseCase');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');
const LoginHistoryRepository = require('../../infrastructure/repositories/LoginHistoryRepository');
const AuditLogRepository = require('../../infrastructure/repositories/AuditLogRepository');

const sharedOtpRepository = new OtpRepository();
const sharedLoginHistoryRepository = new LoginHistoryRepository();
const sharedAuditLogRepository = new AuditLogRepository();

function getRequestMeta(req) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

class AuthController {
  constructor({
    requestOtpUseCase = null,
    verifyOtpUseCase = null,
    loginHistoryUseCase = null,
    auditLogUseCase = null,
    logoutUseCase = null,
  } = {}) {
    this.requestOtpUseCase = requestOtpUseCase || new RequestOtpUseCase({ otpRepository: sharedOtpRepository });
    this.verifyOtpUseCase = verifyOtpUseCase || new VerifyOtpUseCase({ otpRepository: sharedOtpRepository });
    this.loginHistoryUseCase = loginHistoryUseCase || new RecordLoginHistoryUseCase({ loginHistoryRepository: sharedLoginHistoryRepository });
    this.auditLogUseCase = auditLogUseCase || new RecordAuditLogUseCase({ auditLogRepository: sharedAuditLogRepository });
    this.logoutUseCase = logoutUseCase || new LogoutUseCase();
  }

  async logout(req, res) {
    const token = extractAccessToken(req);

    try {
      const result = await this.logoutUseCase.execute(token);
      const meta = getRequestMeta(req);

      await this.auditLogUseCase.execute({
        userId: req.user?.userId || null,
        action: 'LOGOUT',
        moduleName: 'auth',
        entityType: 'user',
        entityId: req.user?.userId || 'unknown',
        newValues: { sessionId: result.sessionId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      res.clearCookie('access_token', { path: '/' });

      return res.status(200).json({
        success: true,
        status_code: 200,
        message: 'Logged out successfully',
        data: {
          sessionRevoked: result.revoked,
          sessionId: result.sessionId,
        },
      });
    } catch (error) {
      res.clearCookie('access_token', { path: '/' });
      return res.status(200).json({
        success: true,
        status_code: 200,
        message: 'Logged out successfully',
        data: { sessionRevoked: false, sessionId: null },
      });
    }
  }

  async requestOtp(req, res) {
    const { phoneNumber } = req.body || {};
    const meta = getRequestMeta(req);

    try {
      const result = await this.requestOtpUseCase.execute(phoneNumber);

      await this.loginHistoryUseCase.execute({
        phoneNumber,
        loginType: 'otp_request',
        status: 'success',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      await this.auditLogUseCase.execute({
        action: 'OTP_REQUEST',
        moduleName: 'auth',
        entityType: 'user',
        entityId: phoneNumber,
        newValues: { phoneNumber, expiresAt: result.expiresAt },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return res.status(200).json({
        success: true,
        status_code: 200,
        message: result.message,
        data: {
          phoneNumber: result.phoneNumber,
          otpCode: result.otpCode,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      await this.loginHistoryUseCase.execute({
        phoneNumber: phoneNumber || 'unknown',
        loginType: 'otp_request',
        status: 'failed',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        failureReason: error.message,
      });

      return res.status(400).json({
        success: false,
        status_code: 400,
        message: error.message || 'Unable to request OTP',
      });
    }
  }

  async verifyOtp(req, res) {
    const { phoneNumber, otpCode } = req.body || {};
    const meta = getRequestMeta(req);

    try {
      const result = await this.verifyOtpUseCase.execute(phoneNumber, otpCode, 'login', {
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      });

      await this.loginHistoryUseCase.execute({
        userId: result.user?.id || null,
        phoneNumber,
        loginType: 'otp_verify',
        status: 'success',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      await this.auditLogUseCase.execute({
        userId: result.user?.id || null,
        action: 'LOGIN_SUCCESS',
        moduleName: 'auth',
        entityType: 'user',
        entityId: result.user?.id || phoneNumber,
        newValues: { phoneNumber, role: result.user?.role },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      res.cookie('access_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60 * 1000,
      });

      return res.status(200).json({
        success: true,
        status_code: 200,
        message: result.message,
        // Access token is delivered only through the HttpOnly cookie above.
        // Never expose it to JavaScript in the JSON response.
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      await this.loginHistoryUseCase.execute({
        phoneNumber: phoneNumber || 'unknown',
        loginType: 'otp_verify',
        status: 'failed',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        failureReason: error.message,
      });

      await this.auditLogUseCase.execute({
        action: 'LOGIN_FAILED',
        moduleName: 'auth',
        entityType: 'user',
        entityId: phoneNumber || 'unknown',
        metadata: { reason: error.message },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      const statusCode = error.code === 'AUTH_SESSION_UNAVAILABLE' ? 503 : 401;
      return res.status(statusCode).json({
        success: false,
        status_code: statusCode,
        message: error.message || 'Invalid or expired OTP',
      });
    }
  }
}

module.exports = AuthController;

const RequestOtpUseCase = require('../../application/use-cases/RequestOtpUseCase');
const VerifyOtpUseCase = require('../../application/use-cases/VerifyOtpUseCase');
const RecordLoginHistoryUseCase = require('../../application/use-cases/RecordLoginHistoryUseCase');
const RecordAuditLogUseCase = require('../../application/use-cases/RecordAuditLogUseCase');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');
const LoginHistoryRepository = require('../../infrastructure/repositories/LoginHistoryRepository');
const AuditLogRepository = require('../../infrastructure/repositories/AuditLogRepository');

const sharedOtpRepository = new OtpRepository();
const sharedLoginHistoryRepository = new LoginHistoryRepository();
const sharedAuditLogRepository = new AuditLogRepository();

/**
 * Extract IP and user agent from request.
 */
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
  } = {}) {
    this.requestOtpUseCase = requestOtpUseCase || new RequestOtpUseCase({ otpRepository: sharedOtpRepository });
    this.verifyOtpUseCase = verifyOtpUseCase || new VerifyOtpUseCase({ otpRepository: sharedOtpRepository });
    this.loginHistoryUseCase = loginHistoryUseCase || new RecordLoginHistoryUseCase({ loginHistoryRepository: sharedLoginHistoryRepository });
    this.auditLogUseCase = auditLogUseCase || new RecordAuditLogUseCase({ auditLogRepository: sharedAuditLogRepository });
  }

  async requestOtp(req, res) {
    const { phoneNumber } = req.body || {};
    const meta = getRequestMeta(req);

    try {
      const result = await this.requestOtpUseCase.execute(phoneNumber);

      // Record login history (OTP request = info-level entry)
      await this.loginHistoryUseCase.execute({
        phoneNumber,
        loginType: 'otp_request',
        status: 'success',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      // Audit log
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
      // Record failed attempt
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

      // Record successful login
      await this.loginHistoryUseCase.execute({
        userId: result.user?.id || null,
        phoneNumber,
        loginType: 'otp_verify',
        status: 'success',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      // Audit log
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

      // کوکی HttpOnly برای کلاینت وب (همراه با بدنه JSON برای کلاینت‌های موبایل).
      // res.cookie از خود Express است — هیچ پکیج اضافه‌ای لازم نیست.
      res.cookie('access_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60 * 1000, // ۱۵ دقیقه — هم‌تراز با عمر Access Token
      });

      return res.status(200).json({
        success: true,
        status_code: 200,
        message: result.message,
        data: {
          token: result.token,
          user: result.user,
        },
      });
    } catch (error) {
      // Record failed login attempt
      await this.loginHistoryUseCase.execute({
        phoneNumber: phoneNumber || 'unknown',
        loginType: 'otp_verify',
        status: 'failed',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        failureReason: error.message,
      });

      // Audit log for failed login
      await this.auditLogUseCase.execute({
        action: 'LOGIN_FAILED',
        moduleName: 'auth',
        entityType: 'user',
        entityId: phoneNumber || 'unknown',
        metadata: { reason: error.message },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return res.status(401).json({
        success: false,
        status_code: 401,
        message: error.message || 'Invalid or expired OTP',
      });
    }
  }
}

module.exports = AuthController;
const RequestOtpUseCase = require('../../application/use-cases/RequestOtpUseCase');
const VerifyOtpUseCase = require('../../application/use-cases/VerifyOtpUseCase');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');

const sharedOtpRepository = new OtpRepository();

class AuthController {
  constructor({ requestOtpUseCase = null, verifyOtpUseCase = null } = {}) {
    this.requestOtpUseCase = requestOtpUseCase || new RequestOtpUseCase(sharedOtpRepository);
    this.verifyOtpUseCase = verifyOtpUseCase || new VerifyOtpUseCase({ otpRepository: sharedOtpRepository });
  }

  async requestOtp(req, res) {
    try {
      const { phoneNumber } = req.body || {};
      const result = await this.requestOtpUseCase.execute(phoneNumber);

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
      return res.status(400).json({
        success: false,
        status_code: 400,
        message: error.message || 'Unable to request OTP',
      });
    }
  }

  async verifyOtp(req, res) {
    try {
      const { phoneNumber, otpCode } = req.body || {};
      const result = await this.verifyOtpUseCase.execute(phoneNumber, otpCode);

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
      return res.status(401).json({
        success: false,
        status_code: 401,
        message: error.message || 'Invalid or expired OTP',
      });
    }
  }
}

module.exports = AuthController;

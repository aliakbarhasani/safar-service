const OtpRepository = require('../../infrastructure/repositories/OtpRepository');

class RequestOtpUseCase {
  constructor(otpRepository = null) {
    this.otpRepository = otpRepository || new OtpRepository();
  }

  async execute(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('phoneNumber is required');
    }

    const otpCode = this._generateOtp();
    const expiresAt = Date.now() + 2 * 60 * 1000;

    await this.otpRepository.save(phoneNumber, otpCode, expiresAt);

    // Simulate SMS dispatch
    console.log(`[OTP] SMS to ${phoneNumber}: ${otpCode}`);

    return {
      success: true,
      message: 'OTP sent successfully',
      phoneNumber,
      otpCode,
      expiresAt,
    };
  }

  _generateOtp() {
    return String(Math.floor(10000 + Math.random() * 90000));
  }
}

module.exports = RequestOtpUseCase;

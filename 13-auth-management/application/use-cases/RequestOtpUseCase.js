const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');
const ConsoleSmsProvider = require('../../domain/strategies/ConsoleSmsProvider');

class RequestOtpUseCase {
  constructor({ otpRepository = null, smsProvider = null, config = {} } = {}) {
    this.otpRepository = otpRepository || new OtpRepository();
    this.smsProvider = smsProvider || new ConsoleSmsProvider();
    this.config = {
      codeLength: config.codeLength || 5,
      ttlSeconds: config.ttlSeconds || 120,
      maxAttempts: config.maxAttempts || 5,
      rateLimitPerPhonePerHour: config.rateLimitPerPhonePerHour || 5,
    };
  }

  async execute(phoneNumber, type = 'login') {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Note: We don't block OTP requests based on previous verification attempts.
    // The save() method resets attempts to 0 when generating a new OTP.
    // Rate limiting middleware (strictRateLimit) handles request-side throttling.

    // OTP must use a cryptographically secure random source.
    // Math.random() is not suitable for authentication codes.
    const min = 10 ** (this.config.codeLength - 1);
    const max = (10 ** this.config.codeLength) - 1;
    const otpCode = String(crypto.randomInt(min, max + 1));
    const codeHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + this.config.ttlSeconds * 1000).toISOString();

    await this.otpRepository.save(phoneNumber, codeHash, expiresAt, type);

    const message = `Your ${type} OTP code is: ${otpCode}. Valid for ${this.config.ttlSeconds} seconds.`;
    await this.smsProvider.send(phoneNumber, message);

    return {
      success: true,
      message: 'OTP sent successfully',
      phoneNumber,
      expiresAt,
      ttl: this.config.ttlSeconds,
      // کد OTP فقط در محیط‌های غیرproduction برگردانده می‌شود (تست/توسعه).
      // در production مقدار undefined است و در JSON سریالایز نمی‌شود.
      otpCode: process.env.NODE_ENV === 'production' ? undefined : otpCode,
    };
  }
}

module.exports = RequestOtpUseCase;

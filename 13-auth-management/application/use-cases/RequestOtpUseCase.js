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

    // SECURITY: ConsoleSmsProvider only logs codes and is never a real delivery
    // channel. Do not generate or log OTPs in production without a real provider.
    if (process.env.NODE_ENV === 'production' && this.smsProvider instanceof ConsoleSmsProvider) {
      const error = new Error('OTP delivery provider is not configured.');
      error.code = 'SMS_PROVIDER_NOT_CONFIGURED';
      error.statusCode = 503;
      throw error;
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

    const exposeOtpCode = process.env.NODE_ENV === 'test';

    return {
      success: true,
      message: 'OTP sent successfully',
      phoneNumber,
      expiresAt,
      ttl: this.config.ttlSeconds,
      // کد OTP فقط در محیط‌های توسعه و تست برگردانده می‌شود.
      // در production یا وقتی NODE_ENV تنظیم نشده باشد، کد هرگز در پاسخ API قرار نمی‌گیرد.
      otpCode: exposeOtpCode ? otpCode : undefined,
    };
  }
}

module.exports = RequestOtpUseCase;

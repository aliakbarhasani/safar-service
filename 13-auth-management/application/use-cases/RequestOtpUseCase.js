const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');
const ConsoleSmsProvider = require('../../domain/strategies/ConsoleSmsProvider');
const { normalizePhoneNumber } = require('../../domain/services/PhoneNumber');

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
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhoneNumber) {
      const error = new Error('A valid phone number is required');
      error.code = 'INVALID_PHONE_NUMBER';
      error.statusCode = 400;
      throw error;
    }
    phoneNumber = normalizedPhoneNumber;

    // SECURITY: ConsoleSmsProvider is a development/test adapter, not a delivery
    // channel. Fail closed unless the environment explicitly permits this adapter.
    const consoleProviderAllowed = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    if (this.smsProvider instanceof ConsoleSmsProvider && !consoleProviderAllowed) {
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
    try {
      await this.smsProvider.send(phoneNumber, message);
    } catch (sendError) {
      // Remove only this request's OTP. A newer concurrent request may have
      // replaced it for the same phone number and type.
      try {
        await this.otpRepository.deleteIfCodeHashMatches(phoneNumber, type, codeHash);
      } catch (cleanupError) {
        if (sendError && typeof sendError === 'object') {
          sendError.cleanupError = cleanupError;
        }
      }
      throw sendError;
    }

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

const bcrypt = require('bcryptjs');
const User = require('../../domain/entities/User');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');
const UserRepository = require('../../infrastructure/repositories/UserRepository');
const JwtService = require('../../domain/services/JwtService');

class VerifyOtpUseCase {
  constructor({ otpRepository = null, userRepository = null, jwtService = null } = {}) {
    this.otpRepository = otpRepository || new OtpRepository();
    this.userRepository = userRepository || new UserRepository();
    // از JwtService (RS256) استفاده می‌شود تا الگوریتم توکن با بقیه سیستم یکی باشد
    this.jwtService = jwtService || new JwtService();
  }

  async execute(phoneNumber, otpCode, type = 'login') {
    if (!phoneNumber || !otpCode) {
      throw new Error('phoneNumber and otpCode are required');
    }

    const otpEntry = await this.otpRepository.findByPhoneNumber(phoneNumber, type);

    if (!otpEntry) {
      throw new Error('Invalid OTP');
    }

    if (otpEntry.isUsed) {
      throw new Error('OTP has already been used. Please request a new one.');
    }

    if (otpEntry.isExpired()) {
      await this.otpRepository.delete(phoneNumber, type);
      throw new Error('OTP has expired. Please request a new one.');
    }

    if (otpEntry.attempts >= otpEntry.maxAttempts) {
      await this.otpRepository.delete(phoneNumber, type);
      throw new Error('Maximum OTP attempts exceeded. Please request a new one.');
    }

    const isCodeValid = await bcrypt.compare(otpCode, otpEntry.codeHash);
    if (!isCodeValid) {
      await this.otpRepository.incrementAttempt(phoneNumber, type);
      throw new Error('Invalid OTP');
    }

    await this.otpRepository.markUsed(phoneNumber, type);

    let user = await this.userRepository.findByPhoneNumber(phoneNumber);
    if (!user) {
      const randomPassword = `otp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      user = await this.userRepository.create({
        phoneNumber,
        firstName: 'User',
        lastName: String(Date.now()).slice(-6),
        passwordHash,
        role: 'passenger',
        status: 'active',
        isPhoneVerified: true,
      });
    }

    // توکن دسترسی با RS256 از طریق JwtService (سازگار با همه‌ی سرویس‌ها)
    const token = this.jwtService.generateAccessToken({
      id: user.id,
      phoneNumber: user.phone_number,
      role: user.role,
    });

    return {
      success: true,
      message: 'OTP verified successfully',
      token,
      user: {
        id: user.id,
        phoneNumber: user.phone_number,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }
}

module.exports = VerifyOtpUseCase;
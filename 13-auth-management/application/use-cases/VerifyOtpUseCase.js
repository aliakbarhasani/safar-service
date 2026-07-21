const jwt = require('jsonwebtoken');
const User = require('../../domain/entities/User');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');

class VerifyOtpUseCase {
  constructor({ otpRepository = null, jwtSecret = null, userStore = null } = {}) {
    this.otpRepository = otpRepository || new OtpRepository();
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || 'dev-secret';
    this.userStore = userStore || new Map();
  }

  async execute(phoneNumber, otpCode) {
    if (!phoneNumber || !otpCode) {
      throw new Error('phoneNumber and otpCode are required');
    }

    const otpEntry = await this.otpRepository.findByPhoneNumber(phoneNumber);
    if (!otpEntry || otpEntry.otpCode !== otpCode) {
      throw new Error('Invalid OTP');
    }

    await this.otpRepository.delete(phoneNumber);

    let user = this.userStore.get(phoneNumber);
    if (!user) {
      user = new User({
        id: `user-${Date.now()}`,
        phoneNumber,
        role: 'rider',
      });
      this.userStore.set(phoneNumber, user);
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    return {
      success: true,
      message: 'OTP verified successfully',
      token,
      user,
    };
  }
}

module.exports = VerifyOtpUseCase;

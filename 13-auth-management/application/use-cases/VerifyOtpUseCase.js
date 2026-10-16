const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const UserRepository = require('../../infrastructure/repositories/UserRepository');
const OtpRepository = require('../../infrastructure/repositories/OtpRepository');
const JwtService = require('../../domain/services/JwtService');
const SessionManager = require('../../domain/services/SessionManager');
const { normalizePhoneNumber } = require('../../domain/services/PhoneNumber');

class VerifyOtpUseCase {
  constructor({ otpRepository = null, userRepository = null, jwtService = null, sessionManager = null } = {}) {
    this.otpRepository = otpRepository || new OtpRepository();
    this.userRepository = userRepository || new UserRepository();
    this.jwtService = jwtService || new JwtService();
    this.sessionManager = sessionManager || new SessionManager();
  }

  async execute(phoneNumber, otpCode, type = 'login', deviceInfo = {}) {
    if (!phoneNumber || !otpCode) {
      throw new Error('phoneNumber and otpCode are required');
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhoneNumber) {
      const error = new Error('A valid phone number is required');
      error.code = 'INVALID_PHONE_NUMBER';
      error.statusCode = 400;
      throw error;
    }
    phoneNumber = normalizedPhoneNumber;

    const otpEntry = await this.otpRepository.findByPhoneNumber(phoneNumber, type);
    if (!otpEntry) throw new Error('Invalid OTP');

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
      const attempt = await this.otpRepository.incrementAttempt(phoneNumber, type);
      if (!attempt.accepted || attempt.attempts >= attempt.maxAttempts) {
        await this.otpRepository.delete(phoneNumber, type);
        throw new Error('Maximum OTP attempts exceeded. Please request a new one.');
      }
      throw new Error('Invalid OTP');
    }

    // Atomically consume the OTP so concurrent requests cannot both authenticate
    // with the same code. The repository performs the final state check in the DB.
    const marked = await this.otpRepository.markUsed(phoneNumber, type);
    if (!marked.accepted) {
      throw new Error('OTP has already been used or is no longer valid. Please request a new one.');
    }

    let user = await this.userRepository.findByPhoneNumber(phoneNumber);
    if (!user) {
      const randomPassword = `otp-${crypto.randomBytes(24).toString('base64url')}`;
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

    // Session creation is mandatory because authentication middleware validates
    // the access-token jti against user_sessions. A bare JWT fallback would
    // therefore create a token that is immediately rejected by middleware.
    try {
      const session = await this.sessionManager.createSession(
        {
          id: user.id,
          phoneNumber: user.phone_number,
          role: user.role,
        },
        {
          userAgent: deviceInfo.userAgent,
          ipAddress: deviceInfo.ipAddress,
        }
      );

      return {
        success: true,
        message: 'OTP verified successfully',
        token: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
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
    } catch (sessionErr) {
      const error = new Error(
        'Authentication session store is temporarily unavailable. Please try again later.'
      );
      error.code = 'AUTH_SESSION_UNAVAILABLE';
      error.cause = sessionErr;
      throw error;
    }
  }
}

module.exports = VerifyOtpUseCase;

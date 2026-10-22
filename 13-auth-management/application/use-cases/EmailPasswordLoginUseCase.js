const bcrypt = require('bcryptjs');
const UserRepository = require('../../infrastructure/repositories/UserRepository');
const SessionManager = require('../../domain/services/SessionManager');

class EmailPasswordLoginUseCase {
  constructor({ userRepository = null, sessionManager = null } = {}) {
    this.userRepository = userRepository || new UserRepository();
    this.sessionManager = sessionManager || new SessionManager();
  }

  async execute(email, password, deviceInfo = {}) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || typeof password !== 'string' || !password) {
      const error = new Error('Email and password are required');
      error.statusCode = 400;
      throw error;
    }

    const user = await this.userRepository.findByEmail(normalizedEmail);
    // Same response for unknown email and wrong password to reduce account enumeration.
    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }
    if (user.status !== 'active') {
      const error = new Error('This account is not active');
      error.statusCode = 403;
      throw error;
    }

    try {
      const session = await this.sessionManager.createSession({
        id: user.id,
        email: user.email,
        phoneNumber: user.phone_number,
        role: user.role,
      }, deviceInfo);
      return {
        success: true,
        accessToken: session.accessToken,
        sessionId: session.sessionId,
        user: {
          id: user.id,
          email: user.email,
          phoneNumber: user.phone_number,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          status: user.status,
          isEmailVerified: Boolean(user.is_email_verified),
        },
      };
    } catch (cause) {
      const error = new Error('Authentication session store is temporarily unavailable. Please try again later.');
      error.code = 'AUTH_SESSION_UNAVAILABLE';
      error.statusCode = 503;
      error.cause = cause;
      throw error;
    }
  }
}

module.exports = EmailPasswordLoginUseCase;

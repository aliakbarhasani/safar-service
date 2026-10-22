const bcrypt = require('bcryptjs');
const User = require('../../domain/entities/User');
const UserRepository = require('../../infrastructure/repositories/UserRepository');
const eventBus = require('../../../01-core-system/EventBus');
const { normalizePhoneNumber } = require('../../domain/services/PhoneNumber');

class RegisterUserUseCase {
  constructor(userRepository = null) {
    this.userRepository = userRepository || new UserRepository();
    this.bcrypt = bcrypt;
  }

  async execute(input = {}) {
    const {
      phoneNumber,
      firstName,
      lastName,
      email,
      password,
      role = 'passenger',
      countryId = null,
      preferredCurrencyId = null,
    } = input;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !firstName || !lastName || !password) {
      throw new Error('email, firstName, lastName, and password are required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('Validation failed: Invalid email format');
    }
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
      throw new Error('Password must be between 10 and 128 characters');
    }

    const normalizedPhoneNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
    if (phoneNumber && !normalizedPhoneNumber) {
      throw new Error('Validation failed: Invalid phone number');
    }

    const normalizedRole = String(role || 'passenger').trim().toLowerCase();
    const allowedRoles = ['passenger', 'driver', 'provider', 'courier', 'seller', 'advertiser'];
    if (normalizedRole === 'admin' || normalizedRole === 'super_admin') {
      throw new Error('Admin roles cannot be self-assigned during registration.');
    }
    if (!allowedRoles.includes(normalizedRole)) {
      throw new Error(`Invalid role. Must be one of: ${allowedRoles.join(', ')}`);
    }

    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) throw new Error('An account with this email already exists');
    if (normalizedPhoneNumber) {
      const existingPhoneUser = await this.userRepository.findByPhoneNumber(normalizedPhoneNumber);
      if (existingPhoneUser) throw new Error('User already exists with this phone number');
    }

    const passwordHash = await this.bcrypt.hash(password, 10);
    const user = new User({
      phoneNumber: normalizedPhoneNumber,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      passwordHash,
      role: normalizedRole,
      status: 'active',
      countryId,
      preferredCurrencyId,
      isPhoneVerified: false,
      isEmailVerified: false,
    });
    const validation = user.isValid();
    if (!validation.isValid) throw new Error(`Validation failed: ${validation.errors.join(', ')}`);

    const createdUser = await this.userRepository.create({
      phoneNumber: user.phoneNumber || null,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      status: user.status,
      countryId: user.countryId,
      preferredCurrencyId: user.preferredCurrencyId,
      avatarUrl: user.avatarUrl,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
    });

    eventBus.publish('UserRegistered', {
      userId: createdUser.id,
      phoneNumber: createdUser.phone_number,
      firstName: createdUser.first_name,
      lastName: createdUser.last_name,
      email: createdUser.email,
      role: createdUser.role,
      status: createdUser.status,
      createdAt: createdUser.created_at,
      meta: {
        requestedRole: normalizedRole,
        type: normalizedRole === 'seller' || normalizedRole === 'advertiser' ? 'business_profile_registration' : 'standard_registration',
      },
    });

    return {
      success: true,
      message: 'User registered successfully',
      data: {
        id: createdUser.id,
        phoneNumber: createdUser.phone_number,
        firstName: createdUser.first_name,
        lastName: createdUser.last_name,
        email: createdUser.email,
        role: createdUser.role,
        status: createdUser.status,
        createdAt: createdUser.created_at,
      },
    };
  }
}

module.exports = RegisterUserUseCase;

const bcrypt = require('bcryptjs');
const User = require('../../domain/entities/User');
const UserRepository = require('../../infrastructure/repositories/UserRepository');
const eventBus = require('../../../01-core-system/EventBus');

class RegisterUserUseCase {
  constructor(userRepository = null) {
    this.userRepository = userRepository || new UserRepository();
    this.bcrypt = bcrypt;
  }

  async execute(input) {
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

    if (!phoneNumber || !firstName || !lastName || !password) {
      throw new Error('phoneNumber, firstName, lastName, and password are required');
    }

    const normalizedRole = String(role || 'passenger').trim().toLowerCase();
    const allowedRoles = ['passenger', 'driver', 'provider', 'seller', 'advertiser', 'admin', 'super_admin'];

    if (!allowedRoles.includes(normalizedRole)) {
      throw new Error(`Invalid role. Must be one of: ${allowedRoles.join(', ')}`);
    }

    const passwordHash = await this.bcrypt.hash(password, 10);

    const user = new User({
      phoneNumber,
      firstName,
      lastName,
      email: email || null,
      passwordHash,
      role: normalizedRole,
      status: 'active',
      countryId,
      preferredCurrencyId,
      isPhoneVerified: false,
      isEmailVerified: false,
    });

    const validation = user.isValid();
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const existingUser = await this.userRepository.findByPhoneNumber(phoneNumber);
    if (existingUser) {
      throw new Error('User already exists with this phone number');
    }

    const createdUser = await this.userRepository.create({
      phoneNumber: user.phoneNumber,
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
const { normalizePhoneNumber } = require('../services/PhoneNumber');

class User {
  constructor({
    id = null,
    phoneNumber,
    firstName,
    lastName,
    email = null,
    passwordHash = null,
    role = 'passenger',
    status = 'active',
    countryId = null,
    preferredCurrencyId = null,
    avatarUrl = null,
    isPhoneVerified = false,
    isEmailVerified = false,
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
    deletedAt = null
  } = {}) {
    this.id = id;
    this.phoneNumber = phoneNumber;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.passwordHash = passwordHash;
    this.role = role;
    this.status = status;
    this.countryId = countryId;
    this.preferredCurrencyId = preferredCurrencyId;
    this.avatarUrl = avatarUrl;
    this.isPhoneVerified = isPhoneVerified;
    this.isEmailVerified = isEmailVerified;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
  }

  // Validation helper
  isValid() {
    const errors = [];

    const hasPhone = Boolean(this.phoneNumber && this._isValidPhoneNumber(this.phoneNumber));
    const hasEmail = Boolean(this.email && this._isValidEmail(String(this.email).trim().toLowerCase()));
    if (!hasPhone && !hasEmail) errors.push('A valid phone number or email is required');

    if (!this.firstName || this.firstName.trim().length < 2) {
      errors.push('First name must be at least 2 characters');
    }

    if (!this.lastName || this.lastName.trim().length < 2) {
      errors.push('Last name must be at least 2 characters');
    }

    if (!this.passwordHash) {
      errors.push('Password is required');
    }

    const validRoles = ['passenger', 'driver', 'provider', 'seller', 'advertiser', 'admin', 'super_admin'];
    if (!validRoles.includes(this.role)) {
      errors.push(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const validStatuses = ['active', 'inactive', 'suspended', 'banned'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (this.email && !this._isValidEmail(String(this.email).trim().toLowerCase())) {
      errors.push('Invalid email format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  _isValidPhoneNumber(phone) {
    return normalizePhoneNumber(phone) !== null;
  }

  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = User;
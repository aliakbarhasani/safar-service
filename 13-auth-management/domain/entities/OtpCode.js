class OtpCode {
  constructor({
    id = null,
    phoneNumber,
    email = null,
    codeHash,
    type = 'login',
    attempts = 0,
    maxAttempts = 5,
    isUsed = false,
    sentAt = new Date().toISOString(),
    verifiedAt = null,
    expiresAt,
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
  } = {}) {
    this.id = id;
    this.phoneNumber = phoneNumber;
    this.email = email;
    this.codeHash = codeHash;
    this.type = type;
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
    this.isUsed = isUsed;
    this.sentAt = sentAt;
    this.verifiedAt = verifiedAt;
    this.expiresAt = expiresAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  isValid() {
    const errors = [];

    if (!this.phoneNumber) {
      errors.push('Phone number is required');
    }

    if (!this.codeHash) {
      errors.push('Code hash is required');
    }

    if (!this.expiresAt) {
      errors.push('Expiration date is required');
    }

    if (this.attempts >= this.maxAttempts) {
      errors.push('Maximum verification attempts exceeded');
    }

    if (this.isUsed) {
      errors.push('OTP has already been used');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  isExpired() {
    return new Date(this.expiresAt) < new Date();
  }
}

module.exports = OtpCode;
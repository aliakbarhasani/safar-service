class OtpRepository {
  constructor() {
    this.store = new Map();
  }

  async save(phoneNumber, otpCode, expiresAt) {
    this.store.set(phoneNumber, { otpCode, expiresAt });
    return { phoneNumber, otpCode, expiresAt };
  }

  async findByPhoneNumber(phoneNumber) {
    const entry = this.store.get(phoneNumber);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(phoneNumber);
      return null;
    }

    return entry;
  }

  async delete(phoneNumber) {
    this.store.delete(phoneNumber);
  }
}

module.exports = OtpRepository;

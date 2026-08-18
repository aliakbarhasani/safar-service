class UserProfile {
  constructor(data = {}) {
    this.userId = data.userId || null;
    this.firstName = data.firstName || null;
    this.lastName = data.lastName || null;
    this.email = data.email || null;
    this.avatarUrl = data.avatarUrl || null;
    this.nationalCode = data.nationalCode || null;
    this.documentStatus = data.documentStatus || 'pending';
  }

  validate() {
    if (this.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      throw new Error('Invalid email format');
    }
    if (this.nationalCode && !/^\d{10}$/.test(this.nationalCode)) {
      throw new Error('Invalid national code format');
    }
    return true;
  }
}

module.exports = UserProfile;
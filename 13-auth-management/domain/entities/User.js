class User {
  constructor({ id, phoneNumber, role = 'rider', createdAt = new Date().toISOString() }) {
    this.id = id;
    this.phoneNumber = phoneNumber;
    this.role = role;
    this.createdAt = createdAt;
  }
}

module.exports = User;

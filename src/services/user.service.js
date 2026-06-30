const User = require('../models/user.model');

async function createUser(data) {
  const user = new User({ name: data.name, phone: data.phone });
  return await user.save();
}

async function getAllUsers() {
  return await User.find().lean();
}

async function getUserById(id) {
  return await User.findById(id).lean();
}

module.exports = {
  createUser,
  getAllUsers,
  getUserById
};

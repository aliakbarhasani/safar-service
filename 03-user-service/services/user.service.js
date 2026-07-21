const mongoose = require('mongoose');
const User = require('../models/user.model');
const { isDBConnected } = require('../../01-core-system/database/db');

const fallbackUsers = [];

async function createUser(data) {
  if (isDBConnected()) {
    const user = new User({ 
      name: data.name, 
      phone: data.phone,
      password: data.password || 'default123',
      role: data.role || 'user'
    });
    return await user.save();
  }

  const user = {
    _id: new mongoose.Types.ObjectId(),
    name: data.name,
    phone: data.phone,
    password: data.password || 'default123',
    role: data.role || 'user',
    createdAt: new Date()
  };
  fallbackUsers.push(user);
  return user;
}

async function getAllUsers() {
  if (isDBConnected()) {
    return await User.find().select('-password').lean();
  }
  return fallbackUsers.map(u => ({ ...u, password: undefined }));
}

async function getUserById(id) {
  if (isDBConnected()) {
    return await User.findById(id).select('-password').lean();
  }
  const user = fallbackUsers.find(user => user._id.toString() === id.toString());
  return user ? { ...user, password: undefined } : null;
}

async function getUserByPhone(phone) {
  if (isDBConnected()) {
    return await User.findOne({ phone }).lean();
  }
  return fallbackUsers.find(user => user.phone === phone) || null;
}

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  getUserByPhone
};
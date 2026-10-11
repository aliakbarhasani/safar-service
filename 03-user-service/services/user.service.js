const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/user.model');
const { isDBConnected } = require('../../01-core-system/database/db');

const fallbackUsers = [];

function assertFallbackAllowed() {
  const explicitlyAllowed = process.env.SAFAR_ALLOW_IN_MEMORY_USER_FALLBACK === 'true';
  if (process.env.NODE_ENV !== 'test' && !explicitlyAllowed) {
    const error = new Error(
      'پایگاه دادهٔ کاربران در دسترس نیست؛ ذخیره‌سازی موقت حافظه مجاز نیست. اتصال پایگاه داده را بررسی کنید.'
    );
    error.code = 'USER_DATABASE_UNAVAILABLE';
    error.statusCode = 503;
    throw error;
  }
}

async function createUser(data) {
  if (isDBConnected()) {
    const user = new User({ 
      name: data.name, 
      phone: data.phone,
      password: data.password || crypto.randomBytes(32).toString('hex'),
      role: data.role || 'user'
    });
    return await user.save();
  }

  assertFallbackAllowed();
  const user = {
    _id: new mongoose.Types.ObjectId(),
    name: data.name,
    phone: data.phone,
    password: data.password || crypto.randomBytes(32).toString('hex'),
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
  assertFallbackAllowed();
  return fallbackUsers.map(u => ({ ...u, password: undefined }));
}

async function getUserById(id) {
  if (isDBConnected()) {
    return await User.findById(id).select('-password').lean();
  }
  assertFallbackAllowed();
  const user = fallbackUsers.find(user => user._id.toString() === id.toString());
  return user ? { ...user, password: undefined } : null;
}

async function getUserByPhone(phone) {
  if (isDBConnected()) {
    return await User.findOne({ phone }).lean();
  }
  assertFallbackAllowed();
  return fallbackUsers.find(user => user.phone === phone) || null;
}

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  getUserByPhone
};
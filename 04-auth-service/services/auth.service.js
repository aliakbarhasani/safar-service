/**
 * auth.service.js - سرویس احراز هویت
 * 
 * طبق بند ۱۲ سند مادر: احراز هویت چندمرحله‌ای
 * این سرویس ثبت‌نام و ورود کاربران را با JWT مدیریت می‌کند
 */

const jwt = require('jsonwebtoken');
const config = require('../../14-config-system/server.config');
const userService = require('../../03-user-service/services/user.service');
const eventBus = require('../../01-core-system/EventBus');

/**
 * ثبت‌نام کاربر جدید
 */
async function register({ name, phone, password, role }) {
  // بررسی وجود کاربر با این شماره تلفن
  const existingUser = await userService.getUserByPhone(phone);
  if (existingUser) {
    return { error: 'User with this phone number already exists' };
  }

  // ایجاد کاربر جدید
  const user = await userService.createUser({ name, phone, password, role });
  
  // تولید توکن JWT
  const token = jwt.sign(
    { userId: user._id, phone: user.phone, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiration }
  );

  // انتشار رویداد ثبت‌نام کاربر جدید
  eventBus.publish('UserRegistered', {
    userId: user._id,
    name: user.name,
    phone: user.phone,
    role: user.role
  });

  return {
    message: 'User registered successfully',
    token,
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role
    }
  };
}

/**
 * ورود کاربر
 */
async function login({ phone, password }) {
  // دریافت کاربر از سرویس کاربران
  const user = await userService.getUserByPhone(phone);
  if (!user) {
    return { error: 'Invalid phone number or password' };
  }

  // بررسی رمز عبور (پشتیبانی از حالت fallback)
  let isPasswordValid = false;
  if (typeof user.comparePassword === 'function') {
    isPasswordValid = await user.comparePassword(password);
  } else {
    // حالت fallback (بدون دیتابیس) - مقایسه مستقیم رمز عبور هش شده
    const bcrypt = require('bcryptjs');
    isPasswordValid = await bcrypt.compare(password, user.password);
  }
  if (!isPasswordValid) {
    return { error: 'Invalid phone number or password' };
  }

  // تولید توکن JWT
  const token = jwt.sign(
    { userId: user._id, phone: user.phone, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiration }
  );

  // انتشار رویداد ورود کاربر
  eventBus.publish('UserLoggedIn', {
    userId: user._id,
    phone: user.phone,
    role: user.role
  });

  return {
    message: 'Login successful',
    token,
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role
    }
  };
}

module.exports = {
  register,
  login
};
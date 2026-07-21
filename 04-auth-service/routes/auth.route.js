/**
 * auth.route.js - مسیرهای احراز هویت
 * 
 * طبق بند ۷ سند مادر: تمام درخواست‌ها از Gateway عبور می‌کنند
 */

const express = require('express');
const router = express.Router();
const { register, login, getProfile } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// ثبت‌نام کاربر جدید
router.post('/register', register);

// ورود کاربر
router.post('/login', login);

// دریافت پروفایل کاربر (نیازمند توکن)
router.get('/profile', authenticate, getProfile);

module.exports = router;
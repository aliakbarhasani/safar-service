/**
 * driver.route.js - مسیرهای مستقل رانندگان (سرویس 07)
 * 
 * تمام مسیرها توسط میدلور authenticate محافظت می شوند
 */

const express = require('express');
const router = express.Router();
const {
  registerDriver,
  updateDriverAccountStatus,
  updateOperationalStatus,
  updateLocation,
  getDriverById,
  getAllDrivers
} = require('../controllers/driver.controller');
const { authenticate } = require('../../04-auth-service/middleware/auth.middleware');

// ثبت‌نام راننده جدید
router.post('/', authenticate, registerDriver);

// تغییر وضعیت حساب توسط ادمین
router.patch('/:id/account-status', authenticate, updateDriverAccountStatus);

// تغییر وضعیت عملیاتی (آنلاین/آفلاین)
router.patch('/:id/operational-status', authenticate, updateOperationalStatus);

// به‌روزرسانی موقعیت مکانی
router.patch('/:id/location', authenticate, updateLocation);

// دریافت اطلاعات راننده
router.get('/:id', authenticate, getDriverById);

// دریافت لیست رانندگان
router.get('/', authenticate, getAllDrivers);

module.exports = router;
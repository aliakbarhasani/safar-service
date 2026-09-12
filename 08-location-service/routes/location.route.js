/**
 * location.route.js - مسیرهای مکان‌یابی بلادرنگ (P3-1)
 *
 * همه مسیرها پشت authenticate قرار دارند. جستجوی رانندگان اطراف
 * نیازمند مجوز drivers.read است.
 */

const express = require('express');
const router = express.Router();
const {
  updateDriverLocation,
  findNearbyDrivers,
  removeDriverLocation,
  getDriverLocation,
} = require('../controllers/location.controller');
const { authenticate, authorize } = require('../../13-auth-management/presentation/middleware/auth.middleware');

// به‌روزرسانی موقعیت راننده (وب‌سوکت یا HTTP polling)
router.patch('/:driverId', authenticate, updateDriverLocation);

// حذف موقعیت راننده (آفلاین شدن / پذیرش سفر)
router.delete('/:driverId', authenticate, removeDriverLocation);

// دریافت موقعیت یک راننده
router.get('/:driverId', authenticate, getDriverLocation);

// جستجوی رانندگان اطراف (نیازمند مجوز)
router.get('/nearby/search', authenticate, authorize('drivers.read'), findNearbyDrivers);

module.exports = router;

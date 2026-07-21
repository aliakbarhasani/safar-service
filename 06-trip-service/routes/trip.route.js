/**
 * trip.route.js - مسیرهای سفر (PostgreSQL, Versioned API)
 * 
 * معماری:
 *   - RESTful API تحت /api/v1/trips
 *   - تمام مسیرها نیازمند احراز هویت (authenticate)
 *   - مسیرهای حساس با RBAC محافظت می‌شوند
 *   - Rate Limiting برای مسیرهای حساس
 * 
 * مسیرها:
 *   POST   /                    - ایجاد درخواست سفر جدید
 *   GET    /                    - لیست سفرها
 *   GET    /driver              - سفرهای راننده جاری
 *   GET    /:id                 - جزئیات سفر
 *   GET    /:id/timeline        - گاه‌شمار سفر
 *   POST   /:id/assign          - تخصیص راننده
 *   PATCH  /:id/status          - به‌روزرسانی وضعیت (OCC)
 *   POST   /:id/cancel          - لغو سفر
 *   POST   /:id/location        - ثبت موقعیت راننده
 *   GET    /:id/route           - دریافت مسیر سفر
 */

const express = require('express');
const router = express.Router();
const {
  createTrip, getTrips, getTripById, assignDriver,
  updateTripStatus, cancelTrip, recordLocation,
  getTripRoute, getDriverTrips, getTimeline
} = require('../controllers/trip.controller');
const { authenticate, authorize } = require('../../04-auth-service/middleware/auth.middleware');

// تمام مسیرها نیازمند احراز هویت هستند
router.use(authenticate);

// POST / - ایجاد درخواست سفر جدید
router.post('/', createTrip);

// GET / - لیست سفرها
router.get('/', getTrips);

// GET /driver - سفرهای راننده جاری
router.get('/driver', getDriverTrips);

// GET /:id - جزئیات سفر
router.get('/:id', getTripById);

// GET /:id/timeline - گاه‌شمار سفر
router.get('/:id/timeline', getTimeline);

// POST /:id/assign - تخصیص راننده (ادمین)
router.post('/:id/assign', authorize('admin', 'super_admin'), assignDriver);

// PATCH /:id/status - به‌روزرسانی وضعیت (با OCC)
router.patch('/:id/status', updateTripStatus);

// POST /:id/cancel - لغو سفر
router.post('/:id/cancel', cancelTrip);

// POST /:id/location - ثبت موقعیت راننده
router.post('/:id/location', recordLocation);

// GET /:id/route - دریافت مسیر سفر
router.get('/:id/route', getTripRoute);

module.exports = router;
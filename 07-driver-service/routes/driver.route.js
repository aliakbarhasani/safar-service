/**
 * driver.route.js - مسیرهای مستقل رانندگان (سرویس 07)
 *
 * تمام مسیرها احراز هویت می‌شوند.
 * کنترل مجوزهای مدیریتی از RBAC مرکزی (17-rbac-service) انجام می‌شود.
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
const { authenticate } = require('../../13-auth-management/presentation/middleware/auth.middleware');
const { authorize: authorizePermission } = require('../../17-rbac-service/presentation/middleware/rbac.middleware');

router.post('/', authenticate, registerDriver);

router.patch(
  '/:id/account-status',
  authenticate,
  authorizePermission('drivers.update_status'),
  updateDriverAccountStatus
);

router.patch('/:id/operational-status', authenticate, updateOperationalStatus);
router.patch('/:id/location', authenticate, updateLocation);
router.get('/:id', authenticate, getDriverById);
router.get('/', authenticate, getAllDrivers);

module.exports = router;

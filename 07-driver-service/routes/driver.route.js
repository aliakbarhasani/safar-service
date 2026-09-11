/**
 * driver.route.js - ãÓíÑåÇí ãÓÊŞá ÑÇääÏÇä (ÓÑæíÓ 07)
 * 
 * ÊãÇã ãÓíÑåÇ ÊæÓØ ãíÏáæÑ authenticate ãÍÇİÙÊ ãíÔæäÏ
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
const { authenticate, authorize } = require('../../13-auth-management/presentation/middleware/auth.middleware');

// ËÈÊäÇã ÑÇääÏå ÌÏíÏ
router.post('/', authenticate, registerDriver);

// ÊÛííÑ æÖÚíÊ ÍÓÇÈ ÊæÓØ ÇÏãíä (äíÇÒ Èå ãÌæÒ drivers.manage)
router.patch('/:id/account-status', authenticate, authorize('drivers.manage'), updateDriverAccountStatus);

// ÊÛííÑ æÖÚíÊ ÚãáíÇÊí (ÂäáÇíä/ÂİáÇíä)
router.patch('/:id/operational-status', authenticate, updateOperationalStatus);

// ÈåÑæÒÑÓÇäí ãæŞÚíÊ ã˜Çäí
router.patch('/:id/location', authenticate, updateLocation);

// ÏÑíÇİÊ ÇØáÇÚÇÊ ÑÇääÏå
router.get('/:id', authenticate, getDriverById);

// ÏÑíÇİÊ áíÓÊ ÑÇääÏÇä
router.get('/', authenticate, getAllDrivers);

module.exports = router;

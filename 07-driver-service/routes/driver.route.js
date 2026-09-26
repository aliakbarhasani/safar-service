/**
 * driver.route.js - ãÓíÑåÇí ãÓÊÞá ÑÇääÏÇä (ÓÑæíÓ 07)
 * 
 * ÊãÇã ãÓíÑåÇ ÊæÓØ ãíÏáæÑ authenticate ãÍÇÝÙÊ ãíÔæäÏ
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

// ÊÛííÑ æÖÚíÊ ÍÓÇÈ ÊæÓØ ÇÏãíä (äíÇÒ Èå ãÌæÒ drivers.update_status)
router.patch('/:id/account-status', authenticate, authorize('drivers.update_status'), updateDriverAccountStatus);

// ÊÛííÑ æÖÚíÊ ÚãáíÇÊí (ÂäáÇíä/ÂÝáÇíä)
router.patch('/:id/operational-status', authenticate, updateOperationalStatus);

// ÈåÑæÒÑÓÇäí ãæÞÚíÊ ã˜Çäí
router.patch('/:id/location', authenticate, updateLocation);

// ÏÑíÇÝÊ ÇØáÇÚÇÊ ÑÇääÏå
router.get('/:id', authenticate, getDriverById);

// ÏÑíÇÝÊ áíÓÊ ÑÇääÏÇä
router.get('/', authenticate, getAllDrivers);

module.exports = router;

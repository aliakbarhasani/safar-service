/**
 * driver.controller.js - کنترلر مستقل رانندگان
 * 
 * فقط نقش نگاشت درخواست‌های HTTP به سرویس
 * هیچ منطق تجاری در این لایه نیست
 */

const driverService = require('../services/driver.service');
// P3-1: سرویس مکان‌یابی بلادرنگ با Redis (no-op اگر Redis موجود نباشد)
const { createLocationService } = require('../../08-location-service/services/location.service');
const { createRedisClient } = require('../../08-location-service/infrastructure/redis/client');
const config = require('../../14-config-system/server.config');
const locationService = createLocationService(createRedisClient(config.redis));

async function registerDriver(req, res) {
  try {
    const fields = { ...(req.body || {}) };
    if (!fields.firstName || !fields.lastName || !fields.phoneNumber) {
      return res.status(400).json({ error: 'firstName, lastName and phoneNumber are required' });
    }
    // SECURITY/SCHEMA: drivers.user_id FK (NOT NULL) - از توکن احرازشده، هرگز از بادی
    if (req.user && (req.user.userId || req.user.id)) {
      fields.userId = req.user.userId || req.user.id;
    }
    const result = await driverService.registerDriver(fields);
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateDriverAccountStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'driverId and status are required' });
    // SECURITY: adminId MUST come from authenticated JWT, never from request body (prevents Admin ID Spoofing)
    const adminId = req.user && (req.user.userId || req.user.id) ? (req.user.userId || req.user.id) : 'system';
    const result = await driverService.updateDriverAccountStatus(id, status, adminId);
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateOperationalStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'driverId and status are required' });
    const result = await driverService.updateOperationalStatus(id, status);
    if (result && result.error) return res.status(400).json({ error: result.error });
    // P3-1: اگر راننده آفلاین شد، موقعیتش را از Redis حذف کن
    if (status === 'offline') {
      locationService.removeDriverLocation(id).catch(() => null);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateLocation(req, res) {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    if (!id || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'driverId, latitude and longitude are required' });
    }
    // P3-1: به‌روزرسانی موقعیت در PostgreSQL (دائمی) و Redis (بلادرنگ) — موازی
    const [pgResult, redisResult] = await Promise.allSettled([
      driverService.updateLocation(id, latitude, longitude),
      locationService.updateDriverLocation(id, longitude, latitude).catch(() => null),
    ]);
    if (pgResult.status === 'rejected') {
      return res.status(400).json({ error: pgResult.reason && pgResult.reason.message });
    }
    const result = pgResult.value;
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json({ ...result, redis: redisResult.status === 'fulfilled' && redisResult.value ? 'ok' : 'skipped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function publicDriverView(driver) {
  if (!driver) return driver;
  return {
    id: driver.id,
    firstName: driver.firstName,
    lastName: driver.lastName,
    accountStatus: driver.accountStatus,
    operationalStatus: driver.operationalStatus,
    rating: driver.rating,
    ratingCount: driver.ratingCount,
    completedTrips: driver.completedTrips,
    cancelledTrips: driver.cancelledTrips,
    currentLocation: driver.currentLocation,
    vehicleType: driver.vehicleType,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt,
  };
}

function canViewSensitiveDriverData(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

async function getDriverById(req, res) {
  try {
    const { id } = req.params;
    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json(canViewSensitiveDriverData(req) ? driver : publicDriverView(driver));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAllDrivers(req, res) {
  try {
    const drivers = await driverService.getAllDrivers();
    res.json(canViewSensitiveDriverData(req) ? drivers : drivers.map(publicDriverView));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  registerDriver,
  updateDriverAccountStatus,
  updateOperationalStatus,
  updateLocation,
  getDriverById,
  getAllDrivers
};
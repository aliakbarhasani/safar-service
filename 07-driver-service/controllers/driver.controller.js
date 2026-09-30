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

    // SECURITY: identity MUST come from the authenticated JWT.
    // Never fall back to a fabricated/system administrator id.
    const adminId = req.user && (req.user.userId || req.user.id);
    if (!adminId) {
      return res.status(401).json({ error: 'Authenticated administrator identity is required' });
    }

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

async function getDriverById(req, res) {
  try {
    const { id } = req.params;
    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAllDrivers(req, res) {
  try {
    const drivers = await driverService.getAllDrivers();
    res.json(drivers);
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

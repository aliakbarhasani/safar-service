/**
 * driver.controller.js - کنترلر مستقل رانندگان
 * 
 * فقط نقش نگاشت درخواست‌های HTTP به سرویس
 * هیچ منطق تجاری در این لایه نیست
 */

const driverService = require('../services/driver.service');

async function registerDriver(req, res) {
  try {
    const fields = req.body;
    if (!fields.firstName || !fields.lastName || !fields.phoneNumber) {
      return res.status(400).json({ error: 'firstName, lastName and phoneNumber are required' });
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
    const { status, adminId } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'driverId and status are required' });
    const result = await driverService.updateDriverAccountStatus(id, status, adminId || 'admin');
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
    const result = await driverService.updateLocation(id, latitude, longitude);
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json(result);
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
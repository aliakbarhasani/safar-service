/**
 * location.controller.js - کنترلر مکان‌یابی بلادرنگ (P3-1)
 *
 * فقط نگاشت HTTP به سرویس. هیچ منطق تجاری در این لایه نیست.
 */

const locationService = require('../services/location.service');

async function updateDriverLocation(req, res) {
  try {
    const { driverId } = req.params;
    const { latitude, longitude } = req.body;
    if (!driverId || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'driverId, latitude and longitude are required' });
    }
    const result = await locationService.updateDriverLocation(driverId, longitude, latitude);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function findNearbyDrivers(req, res) {
  try {
    const { longitude, latitude, radius } = req.query;
    if (longitude == null || latitude == null || radius == null) {
      return res.status(400).json({ error: 'longitude, latitude and radius (km) are required as query params' });
    }
    const drivers = await locationService.findNearbyDrivers(
      parseFloat(longitude),
      parseFloat(latitude),
      parseFloat(radius),
    );
    res.json({ count: drivers.length, drivers });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function removeDriverLocation(req, res) {
  try {
    const { driverId } = req.params;
    if (!driverId) return res.status(400).json({ error: 'driverId is required' });
    const result = await locationService.removeDriverLocation(driverId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getDriverLocation(req, res) {
  try {
    const { driverId } = req.params;
    if (!driverId) return res.status(400).json({ error: 'driverId is required' });
    const result = await locationService.getDriverLocation(driverId);
    if (!result) return res.status(404).json({ error: 'Driver location not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  updateDriverLocation,
  findNearbyDrivers,
  removeDriverLocation,
  getDriverLocation,
};

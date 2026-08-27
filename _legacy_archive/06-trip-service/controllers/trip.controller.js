/**
 * trip.controller.js - کنترلر سفر (PostgreSQL, Versioned API)
 */

const tripService = require('../services/trip.service');

async function createTrip(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const {
      originAddress, originLatitude, originLongitude,
      destinationAddress, destinationLatitude, destinationLongitude,
      paymentMethod, serviceType, estimatedCost, currencyId, countryId
    } = req.body;

    const result = await tripService.createTripRequest({
      passengerId: userId,
      originAddress, originLatitude, originLongitude,
      destinationAddress, destinationLatitude, destinationLongitude,
      paymentMethod, serviceType, estimatedCost, currencyId, countryId
    });
    return res.status(201).json(result);
  } catch (err) {
    const status = err.name === 'ConcurrencyConflictError' ? 409 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
}

async function getTrips(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const role = req.user.role;
    const { status, limit, offset } = req.query;
    const options = {};
    if (status) options.status = status;
    if (limit) options.limit = parseInt(limit, 10);
    if (offset) options.offset = parseInt(offset, 10);

    let result;
    if (role === 'admin' || role === 'super_admin') {
      result = await tripService.getAllTrips(options);
    } else {
      result = await tripService.getTripsByPassenger(userId, options);
    }
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function getTripById(req, res) {
  try {
    const { id } = req.params;
    const result = await tripService.getTripById(id);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function getTimeline(req, res) {
  try {
    const { id } = req.params;
    const result = await tripService.getTripTimeline(id);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function assignDriver(req, res) {
  try {
    const { id } = req.params;
    const { driverId, expectedVersion } = req.body;
    if (!driverId) return res.status(400).json({ success: false, error: 'driverId is required' });
    const result = await tripService.assignDriver(id, driverId, expectedVersion || null);
    return res.json(result);
  } catch (err) {
    const status = err.name === 'ConcurrencyConflictError' ? 409 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
}

async function updateTripStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, expectedVersion, ...extraFields } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });

    // Add OCC version if provided
    if (expectedVersion) extraFields._expectedVersion = expectedVersion;

    const result = await tripService.updateTripStatus(id, status, extraFields);
    return res.json(result);
  } catch (err) {
    const statusCode = err.name === 'ConcurrencyConflictError' ? 409 : 400;
    return res.status(statusCode).json({ success: false, error: err.message });
  }
}

async function cancelTrip(req, res) {
  try {
    const { id } = req.params;
    const { reason, cancelledBy } = req.body;
    const role = req.user.role;
    let result;
    if (cancelledBy === 'driver' || role === 'driver') {
      result = await tripService.cancelByDriver(id, reason);
    } else {
      result = await tripService.cancelByPassenger(id, reason);
    }
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function recordLocation(req, res) {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) return res.status(400).json({ success: false, error: 'latitude and longitude are required' });
    const result = await tripService.recordDriverLocation(id, latitude, longitude);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function getTripRoute(req, res) {
  try {
    const { id } = req.params;
    const result = await tripService.getTripRoute(id);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function getDriverTrips(req, res) {
  try {
    const driverId = req.user.userId || req.user.id;
    const { status, limit, offset } = req.query;
    const options = {};
    if (status) options.status = status;
    if (limit) options.limit = parseInt(limit, 10);
    if (offset) options.offset = parseInt(offset, 10);
    const result = await tripService.getTripsByDriver(driverId, options);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

module.exports = {
  createTrip, getTrips, getTripById, getTimeline,
  assignDriver, updateTripStatus, cancelTrip,
  recordLocation, getTripRoute, getDriverTrips,
};
'use strict';

/**
 * location.routes.js - Location Service (P13-1)
 *
 * روت‌های مکان‌یابی:
 *   POST /api/v1/location/update  → به‌روزرسانی موقعیت راننده (GEOADD)
 *   GET  /api/v1/location/nearby  → جستجوی رانندگان اطراف (GEOSEARCH)
 *
 * امنیت:
 *   - `iamAuthenticate` (RS256) → req.user
 *   - `authorize('driver:location:update')` برای روت update
 *   - driverId از توکن گرفته می‌شود و از بادی پذیرفته نمی‌شود (ضد جعل هویت)
 */

const express = require('express');
const driverService = require('../../07-driver-service/services/driver.service');

function createLocationRoutes({
  geoRepository,
  findNearbyDriversUseCase,
  iamAuthenticate,
  authorize,
  logger,
} = {}) {
  const log = logger || console;
  const router = express.Router();

  if (typeof iamAuthenticate !== 'function' || typeof authorize !== 'function') {
    throw new Error('createLocationRoutes requires iamAuthenticate and authorize middlewares');
  }
  if (!geoRepository) {
    throw new Error('createLocationRoutes requires a geoRepository');
  }
  const nearby = findNearbyDriversUseCase || null;

  /**
   * POST /update
   * Body: { lat: number, lng|lon: number }
   * هویت راننده منحصراً از توکن (req.user.userId) استخراج می‌شود.
   */
  router.post('/update', iamAuthenticate, authorize('driver:location:update'), async (req, res) => {
    const { lat, lng, lon } = req.body || {};
    const longitude = Number(lng === undefined ? lon : lng);
    const latitude = Number(lat);
    const userId = req.user && (req.user.userId || req.user.id);

    try {
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized: no user on request' });
      }
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return res.status(400).json({ success: false, error: 'lat and lng are required numeric values' });
      }
      // Redis GEO keys must use the driver profile ID, not the account user ID.
      const driver = req.user.driverId
        ? { id: req.user.driverId }
        : await driverService.getDriverByUserId(userId);
      if (!driver || !driver.id) {
        return res.status(403).json({ success: false, error: 'Verified driver profile is required to update location' });
      }
      const result = await geoRepository.updateDriverLocation(String(driver.id), longitude, latitude);
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      log.error('[location] update failed:', err.message);
      return res.status(err.statusCode || 400).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /nearby?lat=..&lng=..&radiusKm=..
   * (فقط خواندنی — برای جستجوی نزدیک‌ترین رانندگان)
   */
  // Nearby driver locations are available to authenticated trip creators and administrators only.
  router.get('/nearby', iamAuthenticate, authorize('trip:create'), async (req, res) => {
    try {
      if (!nearby) {
        return res.status(503).json({ success: false, error: 'nearby search unavailable' });
      }
      const { lat, lng, radiusKm } = req.query;
      const result = await nearby.execute({ lat: Number(lat), lon: Number(lng), radiusKm: radiusKm ? Number(radiusKm) : undefined });
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      log.error('[location] nearby failed:', err.message);
      return res.status(err.statusCode || 400).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createLocationRoutes };
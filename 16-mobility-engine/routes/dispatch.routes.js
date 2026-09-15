'use strict';

/**
 * dispatch.routes.js - Mobility Engine (P13-2)
 *
 * روت توزیع سفر (Offer + Distributed Lock):
 *   POST /api/v1/dispatch/trips/:tripId/accept
 *
 * امنیت:
 *   - `iamAuthenticate` (RS256) → req.user
 *   - الزام نقش DRIVER (یا SUPER_ADMIN) → در غیر این صورت 403
 *   - driverId منحصراً از توکن گرفته می‌شود (نه از بادی/هدر) → ضد جعل هویت
 *
 * کدهای پاسخ: 200 پذیرش موفق | 400 ورودی نامعتبر | 401 بدون توکن/توکن نامعتبر |
 *             403 بدون نقش راننده یا آفر منقضی | 404 سفر یافت نشد | 409 تعارض قفل (راننده دیگر)
 */

const express = require('express');

const DRIVER_ROLE = 'DRIVER';
const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

/** @private آیا کاربر توکن احرازشده نقش راننده دارد؟ */
function isDriver(req) {
  const role = String((req.user && req.user.role) || '').toUpperCase();
  return role === SUPER_ADMIN_ROLE || role.includes(DRIVER_ROLE);
}

/** میدل‌ور الزام نقش راننده (بعد از iamAuthenticate). */
function requireDriverRole(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: no authenticated user' });
  }
  if (!isDriver(req)) {
    return res.status(403).json({ success: false, error: `Forbidden: ${DRIVER_ROLE} role required` });
  }
  return next();
}

/**
 * @param {Object} deps
 * @param {Object} deps.acceptTripUseCase - نمونه AcceptTripUseCase (متد acceptOffer)
 * @param {Function} deps.iamAuthenticate - میدل‌ور احراز هویت RS256
 * @param {Object} [deps.logger]
 */
function createDispatchRoutes({ acceptTripUseCase, iamAuthenticate, logger = console } = {}) {
  const log = logger || console;

  if (!acceptTripUseCase || typeof acceptTripUseCase.acceptOffer !== 'function') {
    throw new Error('createDispatchRoutes requires an acceptTripUseCase with acceptOffer()');
  }
  if (typeof iamAuthenticate !== 'function') {
    throw new Error('createDispatchRoutes requires an iamAuthenticate middleware');
  }

  const router = express.Router();

  /**
   * POST /trips/:tripId/accept
   * راننده پیشنهاد سفر را می‌پذیرد: بررسی آفر → قفل SETNX → تغییر وضعیت
   * (تراکنش) + ثبت رویداد TripAccepted در outbox_events.
   */
  router.post('/trips/:tripId/accept', iamAuthenticate, requireDriverRole, async (req, res) => {
    const { tripId } = req.params;
    // SECURITY: هویت راننده فقط از توکن
    const driverId = req.user && (req.user.driverId || req.user.userId || req.user.id);
    const changedByUserId = req.user && (req.user.userId || req.user.id);

    try {
      const result = await acceptTripUseCase.acceptOffer({ tripId, driverId, changedByUserId });
      return res.status(200).json({
        success: true,
        message: 'سفر با موفقیت پذیرفته شد.',
        data: result,
      });
    } catch (error) {
      log.error('[dispatch] acceptOffer failed:', error && error.message);
      const status = error && error.statusCode ? error.statusCode : 500;
      return res.status(status).json({
        success: false,
        error: (error && error.message) || 'خطای داخلی در پذیرش سفر.',
        code: (error && error.code) || null,
      });
    }
  });

  return router;
}

module.exports = { createDispatchRoutes, requireDriverRole, isDriver };
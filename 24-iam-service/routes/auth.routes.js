'use strict';

/**
 * auth.routes.js - IAM Service (P11-1)
 *
 * روت‌های احراز هویت:
 *   POST /login   → تا زمان اتصال احراز هویت واقعی غیرفعال است.
 *   POST /refresh → چرخش Refresh Token ذخیره‌شده در Redis.
 */

const express = require('express');
const router = express.Router();

function createAuthRoutes({ authService, logger }) {
  const log = logger || console;

  // امنیت: صدور توکن بر اساس userId/role ارسالی از درخواست، ورود واقعی نیست.
  // این endpoint تا زمان اتصال به اعتبارسنجی واقعی حساب و نقش باید fail-closed بماند.
  router.post('/login', (_req, res) => {
    return res.status(503).json({
      success: false,
      error: 'AUTHENTICATION_NOT_CONFIGURED',
      message: 'ورود موقتاً غیرفعال است تا احراز هویت واقعی پیکربندی شود.',
    });
  });

  // چرخش Refresh Token؛ فقط توکنی که قبلاً در Redis ذخیره شده باشد پذیرفته می‌شود.
  router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body || {};
    try {
      const result = await authService.refreshToken(refreshToken);
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      log.error('[iam] refresh failed:', err.message);
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createAuthRoutes };

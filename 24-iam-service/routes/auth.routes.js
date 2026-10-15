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
      // Keep internal infrastructure and exception details out of public responses.
      // Only explicitly recognized domain errors receive client-safe status codes.
      const knownErrors = {
        MISSING_REFRESH_TOKEN: {
          statusCode: 400,
          message: 'A refresh token is required.',
        },
        INVALID_REFRESH_TOKEN: {
          statusCode: 401,
          message: 'The refresh token is invalid or expired.',
        },
        REFRESH_TOKEN_STORAGE_UNAVAILABLE: {
          statusCode: 503,
          message: 'Session refresh is temporarily unavailable.',
        },
      };
      const publicError = knownErrors[err && err.code] || {
        statusCode: 500,
        message: 'Unable to refresh the session.',
      };

      log.error('[iam] refresh failed:', {
        code: err && err.code ? err.code : 'UNEXPECTED_ERROR',
        message: err && err.message ? err.message : 'Unknown refresh error',
      });
      return res.status(publicError.statusCode).json({
        success: false,
        error: err && knownErrors[err.code] ? err.code : 'AUTH_REFRESH_FAILED',
        message: publicError.message,
      });
    }
  });

  return router;
}

module.exports = { createAuthRoutes };

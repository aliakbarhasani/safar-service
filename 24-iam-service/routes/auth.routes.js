'use strict';

/**
 * auth.routes.js - IAM Service (P11-1)
 *
 * روت‌های احراز هویت:
 *   POST /v1/auth/login   → صدور جفت توکن (Access + Refresh) — برای تست به صورت Mock
 *   POST /v1/auth/refresh → چرخش Refresh Token
 */

const express = require('express');
const router = express.Router();

function createAuthRoutes({ authService, logger }) {
  const log = logger || console;

  // (Mock) ورودن — در فازهای بعدی با Password/RBAC واقعی تکمیل می‌شود
  router.post('/login', async (req, res) => {
    const { userId, role } = req.body || {};
    try {
      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId is required' });
      }
      const result = await authService.login(userId, role || 'passenger');
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      log.error('[iam] login failed:', err.message);
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  });

  // چرخش Refresh Token
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
/**
 * wallet.route.js - مسیرهای کیف پول (PostgreSQL)
 *
 * احراز هویت برای همه مسیرها الزامی است.
 * عملیات مالی حساس علاوه بر احراز هویت، با مجوز RBAC مرکزی محافظت می‌شوند.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getBalance,
  deposit,
  withdraw,
  transfer,
  freeze,
  releaseHold,
  releaseEscrow,
  refund,
  getTransactions
} = require('../controllers/wallet.controller');
const { authenticate, authorize: authorizeRole } = require('../../13-auth-management/presentation/middleware/auth.middleware');
const { authorize: authorizePermission } = require('../../17-rbac-service/presentation/middleware/rbac.middleware');
const config = require('../../14-config-system/server.config');

const walletLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const financialLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  message: { success: false, error: 'Financial operation rate limit exceeded. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const sensitiveLimiter = rateLimit({
  windowMs: 60000,
  max: 5,
  message: { success: false, error: 'Sensitive operation rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(walletLimiter);

router.get('/balance', authenticate, getBalance);
router.get('/transactions', authenticate, getTransactions);

// این دو عملیات در وضعیت فعلی باید از مسیرهای مجاز مالی انجام شوند.
// مجوزهای canonical پروژه در migration 002 عبارت‌اند از wallets.charge و wallets.deduct.
// در نتیجه کاربر عادی نمی‌تواند با POST مستقیم موجودی را از هیچ ایجاد کند یا برداشت حساس انجام دهد.
router.post('/deposit', authenticate, financialLimiter, authorizePermission('wallets.charge'), deposit);
router.post('/withdraw', authenticate, financialLimiter, authorizePermission('wallets.deduct'), withdraw);

// انتقال وجه بین دو کاربر؛ هویت فرستنده فقط از JWT گرفته می‌شود.
router.post('/transfer', authenticate, financialLimiter, transfer);

// مسدودسازی وجه توسط صاحب کیف پول
router.post('/freeze', authenticate, sensitiveLimiter, freeze);

// عملیات مدیریتی
router.post('/hold/release', authenticate, sensitiveLimiter, authorizeRole('admin', 'super_admin'), releaseHold);
router.post('/escrow/release', authenticate, sensitiveLimiter, authorizeRole('admin', 'super_admin'), releaseEscrow);
router.post('/refund', authenticate, sensitiveLimiter, authorizeRole('admin', 'super_admin'), refund);

module.exports = router;

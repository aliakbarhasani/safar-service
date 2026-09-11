/**
 * wallet.route.js - مسیرهای کیف پول (PostgreSQL)
 * 
 * طبق بند ۷ سند مادر: تمام درخواست‌ها از Gateway عبور می‌کنند
 * این مسیرها توسط میدلور authenticate محافظت می‌شوند
 * 
 * مسیرها (۸ مسیر):
 *   GET    /balance              - دریافت موجودی
 *   POST   /deposit              - شارژ حساب
 *   POST   /withdraw             - برداشت از حساب
 *   POST   /transfer             - انتقال وجه
 *   POST   /freeze               - مسدودسازی وجه
 *   POST   /escrow/release       - آزادسازی Escrow
 *   POST   /refund               - بازگشت وجه
 *   GET    /transactions         - تاریخچه تراکنش‌ها
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
  releaseEscrow,
  refund,
  getTransactions
} = require('../controllers/wallet.controller');
const { authenticate, authorize } = require('../../13-auth-management/presentation/middleware/auth.middleware');
const config = require('../../14-config-system/server.config');

// ============================================================================
// Rate Limiting - محدودیت نرخ درخواست‌های مالی
// ============================================================================

// محدودیت عمومی برای مسیرهای کیف پول
const walletLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// محدودیت شدیدتر برای عملیات‌های حساس مالی
const financialLimiter = rateLimit({
  windowMs: 60000, // 1 دقیقه
  max: 10,         // حداکثر ۱۰ درخواست در دقیقه
  message: {
    success: false,
    error: 'Financial operation rate limit exceeded. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// محدودیت شدید برای Escrow و Refund
const sensitiveLimiter = rateLimit({
  windowMs: 60000,
  max: 5,
  message: {
    success: false,
    error: 'Sensitive operation rate limit exceeded.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// مسیرها
// ============================================================================

// تمام مسیرهای کیف پول نیازمند احراز هویت هستند
router.use(walletLimiter);

// GET /balance - دریافت موجودی (کاربر عادی)
router.get('/balance', authenticate, getBalance);

// POST /deposit - شارژ حساب (نیاز به مجوز wallet.deposit)
router.post('/deposit', authenticate, financialLimiter, authorize('wallet.deposit'), deposit);

// POST /withdraw - برداشت از حساب (نیاز به مجوز wallet.withdraw)
router.post('/withdraw', authenticate, financialLimiter, authorize('wallet.withdraw'), withdraw);

// POST /transfer - انتقال وجه (نیاز به مجوز wallet.transfer)
router.post('/transfer', authenticate, financialLimiter, authorize('wallet.transfer'), transfer);

// POST /freeze - مسدودسازی وجه (کاربر عادی + محدودیت شدید)
router.post('/freeze', authenticate, sensitiveLimiter, freeze);

// POST /escrow/release - آزادسازی Escrow (فقط ادمین + محدودیت شدید)
router.post('/escrow/release', authenticate, sensitiveLimiter, authorize('admin', 'super_admin'), releaseEscrow);

// POST /refund - بازگشت وجه (نیاز به مجوز wallet.refund)
router.post('/refund', authenticate, sensitiveLimiter, authorize('wallet.refund'), refund);

// GET /transactions - تاریخچه تراکنش‌ها (کاربر عادی)
router.get('/transactions', authenticate, getTransactions);

module.exports = router;
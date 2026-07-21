/**
 * api.routes.js - مسیر متمرکز API Gateway
 * 
 * طبق بند ۷ سند مادر: نقطه ورود تمام درخواست‌ها
 * هیچ ماژولی مستقیماً Route خود را به app.js نمی‌دهد
 * همه چیز از این Gateway عبور می‌کند
 */

const express = require('express');
const router = express.Router();

// ===== مسیرهای عمومی =====
const { index } = require('../03-user-service/controllers/home.controller');
router.get('/', index);

// ===== مسیرهای ماژول کاربران (03-user-service) =====
const userRoutes = require('../03-user-service/routes/user.route');
router.use('/api/users', userRoutes);

// ===== مسیرهای ماژول سفر (06-trip-service) =====
const tripRoutes = require('../06-trip-service/routes/trip.route');
router.use('/api/v1/trips', tripRoutes);
router.use('/api/trips', tripRoutes);

// ===== مسیرهای احراز هویت (04-auth-service) =====
const authRoutes = require('../04-auth-service/routes/auth.route');
router.use('/api/auth', authRoutes);

// ===== مسیرهای کیف پول (05-wallet-service) =====
const walletRoutes = require('../05-wallet-service/routes/wallet.route');
router.use('/api/wallets', walletRoutes);

// ===== مسیرهای رانندگان (07-driver-service) =====
const driverRoutes = require('../07-driver-service/routes/driver.route');
router.use('/api/drivers', driverRoutes);

// ===== مسیرهای سلامت =====
const healthRoute = require('./routes/health.route');
router.use('/api/v1', healthRoute);

module.exports = router;

/**
 * api.routes.js - مسیر متمرکز API Gateway
 * 
 * طبق بند ۷ سند مادر: نقطه ورود تمام درخواست‌ها
 * هیچ ماژولی مستقیماً Route خود را به app.js نمی‌دهد
 * همه چیز از این Gateway عبور می‌کند
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
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

// ===== مسیرهای احراز هویت و ثبت‌نام (13-auth-management) =====
const authRoutes = require('../13-auth-management/presentation/routes/AuthRouter');
router.use('/api/auth', authRoutes);

const registrationRoutes = require('../13-auth-management/presentation/routes/RegistrationRouter');
router.use('/api/auth', registrationRoutes);

// ===== مسیرهای کیف پول (05-wallet-service) =====
const walletRoutes = require('../05-wallet-service/routes/wallet.route');
router.use('/api/wallets', walletRoutes);

// ===== مسیرهای رانندگان (07-driver-service) =====
const driverRoutes = require('../07-driver-service/routes/driver.route');
router.use('/api/drivers', driverRoutes);

// ===== مسیرهای بازارچه (09-marketplace) =====
const marketplaceProxy = createProxyMiddleware({
  target: 'http://localhost:3002',
  changeOrigin: true,
  logLevel: 'warn',
  pathRewrite: (path) => {
    if (!path || path === '/') return '/api/v1/marketplace';
    if (path.startsWith('/api/v1/marketplace')) return path;
    return path.startsWith('/') ? `/api/v1/marketplace${path}` : `/api/v1/marketplace/${path}`;
  },
});
router.use('/api/v1/marketplace', marketplaceProxy);

// ===== مسیرهای تبلیغات (10-ads-service) =====
const adsProxy = createProxyMiddleware({
  target: 'http://localhost:3003',
  changeOrigin: true,
  logLevel: 'warn',
  pathRewrite: (path) => {
    if (!path || path === '/') return '/api/v1/ads';
    if (path.startsWith('/api/v1/ads')) return path;
    return path.startsWith('/') ? `/api/v1/ads${path}` : `/api/v1/ads/${path}`;
  },
});
router.use('/api/v1/ads', adsProxy);

// ===== مسیرهای موتور قیمت‌گذاری (15-pricing-engine) =====
const pricingProxy = createProxyMiddleware({
  target: 'http://localhost:3005',
  changeOrigin: true,
  logLevel: 'warn',
  pathRewrite: (path) => {
    if (!path || path === '/') return '/api/v1/pricing';
    if (path.startsWith('/api/v1/pricing')) return path;
    return path.startsWith('/') ? `/api/v1/pricing${path}` : `/api/v1/pricing/${path}`;
  },
});
router.use('/api/v1/pricing', pricingProxy);

// ===== مسیرهای سلامت =====
const healthRoute = require('./routes/health.route');
router.use('/api/v1', healthRoute);

module.exports = router;

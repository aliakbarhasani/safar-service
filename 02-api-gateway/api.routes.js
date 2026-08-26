/**
 * api.routes.js - مسیر متمرکز API Gateway
 * 
 * طبق بند ۷ سند مادر: نقطه ورود تمام درخواست‌ها
 * هیچ ماژولی مستقیماً Route خود را به app.js نمی‌دهد
 * همه چیز از این Gateway عبور می‌کند
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { getPool } = require('../01-core-system/database/db');
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
// روتر زنده‌ی موتور قیمت‌گذاری با تزریق Pool مشترک PostgreSQL تا از بیرون
// (از طریق Gateway) مستقیماً قابل فراخوانی باشد.
const PricingRepository = require('../15-pricing-engine/infrastructure/PricingRepository');
const GenerateQuoteUseCase = require('../15-pricing-engine/application/GenerateQuoteUseCase');
const GetQuoteUseCase = require('../15-pricing-engine/application/GetQuoteUseCase');
const ConsumeQuoteUseCase = require('../15-pricing-engine/application/ConsumeQuoteUseCase');
const PricingController = require('../15-pricing-engine/presentation/PricingController');
const createPricingRouter = require('../15-pricing-engine/presentation/PricingRouter');

const pricingPool = getPool();
const pricingRepository = new PricingRepository(pricingPool);
const generateQuoteUseCase = new GenerateQuoteUseCase(pricingRepository);
const getQuoteUseCase = new GetQuoteUseCase(pricingRepository);
const consumeQuoteUseCase = new ConsumeQuoteUseCase(pricingRepository);
const pricingController = new PricingController({
    generateQuoteUseCase,
    getQuoteUseCase,
    consumeQuoteUseCase,
});
const pricingRouter = createPricingRouter(pricingController);
router.use('/api/v1/pricing', pricingRouter);

// ===== مسیرهای موتور حمل‌ونقل یکپارچه (16-mobility-engine) =====
const RideRepository = require('../16-mobility-engine/infrastructure/RideRepository');
const CreateRideUseCase = require('../16-mobility-engine/application/CreateRideUseCase');
const AcceptRideUseCase = require('../16-mobility-engine/application/AcceptRideUseCase');
const DriverArrivedUseCase = require('../16-mobility-engine/application/DriverArrivedUseCase');
const StartTripUseCase = require('../16-mobility-engine/application/StartTripUseCase');
const CompleteRideUseCase = require('../16-mobility-engine/application/CompleteRideUseCase');
const CancelRideUseCase = require('../16-mobility-engine/application/CancelRideUseCase');
const RideController = require('../16-mobility-engine/presentation/RideController');
const createRideRouter = require('../16-mobility-engine/presentation/RideRouter');

const ridePool = getPool();
const rideRepository = new RideRepository(ridePool);
const createRideUseCase = new CreateRideUseCase({ rideRepository, pricingRepository });
const acceptRideUseCase = new AcceptRideUseCase({ rideRepository });
const driverArrivedUseCase = new DriverArrivedUseCase({ rideRepository });
const startTripUseCase = new StartTripUseCase({ rideRepository });
const completeRideUseCase = new CompleteRideUseCase({ rideRepository });
const cancelRideUseCase = new CancelRideUseCase({ rideRepository });
const rideController = new RideController({
    createRideUseCase,
    acceptRideUseCase,
    driverArrivedUseCase,
    startTripUseCase,
    completeRideUseCase,
    cancelRideUseCase,
});
const rideRouter = createRideRouter(rideController);
router.use('/api/v1/rides', rideRouter);

// ===== مسیرهای سلامت =====
const healthRoute = require('./routes/health.route');
router.use('/api/v1', healthRoute);

module.exports = router;

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

// ===== RBAC: میان‌افزار امنیتی و کنترل دسترسی مرکزی (17-rbac-service) =====
// authenticate: توکن RS256 (Bearer یا کوکی HttpOnly) → req.user
// authorize:   بررسی مجوز granular (مثل 'users.read') یا نقش (مثل 'admin')
const { authenticate, authorize } = require('../17-rbac-service/presentation/middleware/rbac.middleware');
const { RbacModule } = require('../17-rbac-service/index');

// Seed مجوزهای پایه (idempotent — در صورت وجود، خطا نمی‌دهد)
const rbacModule = new RbacModule({ pool: getPool() });
rbacModule.seed().catch((e) => console.warn('[RBAC] seed skipped:', e.message));

// ===== مسیر مدیریت نقش‌ها و مجوزها (فقط admin) =====
router.use('/api/v1/rbac', rbacModule.router());

// ===== مسیرهای عمومی =====
const { index } = require('../03-user-service/controllers/home.controller');
router.get('/', index);

// ===== مسیرهای ماژول کاربران (03-user-service) =====
// محافظت‌شده: مشاهده کاربران نیازمند مجوز users.read، ایجاد کاربر نیازمند users.create
const userRoutes = require('../03-user-service/routes/user.route');
router.use('/api/users', authenticate);
router.get('/api/users', authorize('users.read', 'admin', 'super_admin'));
router.get('/api/users/:id', authorize('users.read', 'admin', 'super_admin'));
router.post('/api/users', authorize('users.create', 'admin', 'super_admin'));
router.use('/api/users', userRoutes);


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
// محافظت‌شده در سطح Gateway (قبل از mount): تغییر وضعیت حساب راننده و لیست رانندگان فقط برای مدیران
router.patch('/api/drivers/:id/account-status', authorize('drivers.update_status', 'admin', 'super_admin'));
router.get('/api/drivers', authorize('drivers.read', 'admin', 'super_admin'));
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
const TripRepository = require('../16-mobility-engine/infrastructure/TripRepository');
const CreateTripUseCase = require('../16-mobility-engine/application/CreateTripUseCase');
const AcceptTripUseCase = require('../16-mobility-engine/application/AcceptTripUseCase');
const DriverArrivedUseCase = require('../16-mobility-engine/application/DriverArrivedUseCase');
const StartTripUseCase = require('../16-mobility-engine/application/StartTripUseCase');
const CompleteTripUseCase = require('../16-mobility-engine/application/CompleteTripUseCase');
const CancelTripUseCase = require('../16-mobility-engine/application/CancelTripUseCase');
const TripController = require('../16-mobility-engine/presentation/TripController');
const createTripRouter = require('../16-mobility-engine/presentation/TripRouter');

const tripPool = getPool();
const tripRepository = new TripRepository(tripPool);
const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository });
const acceptTripUseCase = new AcceptTripUseCase({ tripRepository });
const driverArrivedUseCase = new DriverArrivedUseCase({ tripRepository });
const startTripUseCase = new StartTripUseCase({ tripRepository });
const completeTripUseCase = new CompleteTripUseCase({ tripRepository });
const cancelTripUseCase = new CancelTripUseCase({ tripRepository });
const tripController = new TripController({
    createTripUseCase,
    acceptTripUseCase,
    driverArrivedUseCase,
    startTripUseCase,
    completeTripUseCase,
    cancelTripUseCase,
});
const tripRouter = createTripRouter(tripController);
// محافظت‌شده: همه عملیات سفر نیازمند احراز هویت هستند (RS256 / کوکی HttpOnly)
router.use('/api/v1/trips', authenticate, tripRouter);

// ===== مسیرهای سلامت =====
const healthRoute = require('./routes/health.route');
router.use('/api/v1', healthRoute);

module.exports = router;

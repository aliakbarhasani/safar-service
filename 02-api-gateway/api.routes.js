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
// SECURITY: ترتیب صحیح میان‌افزارها — ابتدا authenticate (ساخت req.user) و سپس authorize
router.patch('/api/drivers/:id/account-status', authenticate, authorize('drivers.update_status', 'admin', 'super_admin'));
router.get('/api/drivers', authenticate, authorize('drivers.read', 'admin', 'super_admin'));
router.use('/api/drivers', driverRoutes);

// ===== مسیرهای بازارچه (09-marketplace) =====
// بازارچه روی 3012 — جلوگیری از تداخل با سرویس‌های دیگر (AdminPanel روی 3002)
const marketplaceProxy = createProxyMiddleware({
  target: process.env.MARKETPLACE_URL || 'http://localhost:3012',
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
// تبلیغات روی 3013 — جدا از سایر سرویس‌ها
const adsProxy = createProxyMiddleware({
  target: process.env.ADS_URL || 'http://localhost:3013',
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
// SECURITY: روت‌های Pricing محافظت‌شده — احراز هویت پیش از دسترسی به محاسبه/دریافت/مصرف پیش‌فاکتور
// (هیچ مسیر عمومی مانند لیست ارزها در PricingRouter تعریف نشده است)
router.use('/api/v1/pricing', authenticate, pricingRouter);

// ===== مسیرهای موتور حمل‌ونقل یکپارچه (16-mobility-engine) =====
const TripRepository = require('../16-mobility-engine/infrastructure/TripRepository');
const CreateTripUseCase = require('../16-mobility-engine/application/CreateTripUseCase');
const AcceptTripUseCase = require('../16-mobility-engine/application/AcceptTripUseCase');
const ArriveAtPickupUseCase = require('../16-mobility-engine/application/ArriveAtPickupUseCase');
const StartTripUseCase = require('../16-mobility-engine/application/StartTripUseCase');
const EndTripUseCase = require('../16-mobility-engine/application/EndTripUseCase');
const CancelTripUseCase = require('../16-mobility-engine/application/CancelTripUseCase');
const TripController = require('../16-mobility-engine/presentation/TripController');
const createTripRouter = require('../16-mobility-engine/presentation/TripRouter');

const tripPool = getPool();
const tripRepository = new TripRepository(tripPool);
// P2-1 (Event-Driven): انتشار رویدادهای دامنه سفر روی EventBus مرکزی
// (بدون وابستگی مستقیم Mobility به Wallet). امضای Envelope مرکزی:
// { event, data, timestamp } — بنابراین adapter باید (event, data) را بگیرد.
const mobilityEventBus = require('../16-mobility-engine/infrastructure/events/event-bus');
const emitTripEvent = (event, data) => mobilityEventBus.publish(event, data);
const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository, emitEvent: emitTripEvent });
const acceptTripUseCase = new AcceptTripUseCase({ tripRepository, emitEvent: emitTripEvent });
const arriveAtPickupUseCase = new ArriveAtPickupUseCase({ tripRepository, emitEvent: emitTripEvent });
const startTripUseCase = new StartTripUseCase({ tripRepository, emitEvent: emitTripEvent });
const endTripUseCase = new EndTripUseCase({ tripRepository, emitEvent: emitTripEvent });
const cancelTripUseCase = new CancelTripUseCase({ tripRepository, emitEvent: emitTripEvent });
const tripController = new TripController({
    createTripUseCase,
    acceptTripUseCase,
    arriveAtPickupUseCase,
    startTripUseCase,
    endTripUseCase,
    cancelTripUseCase,
});
const tripRouter = createTripRouter(tripController);
// محافظت‌شده: همه عملیات سفر نیازمند احراز هویت هستند (RS256 / کوکی HttpOnly)
router.use('/api/v1/trips', authenticate, tripRouter);

// ===== مسیرهای سلامت =====
const healthRoute = require('./routes/health.route');
router.use('/api/v1', healthRoute);

module.exports = router;

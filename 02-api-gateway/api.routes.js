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
// ===== (P6-2) Fare Quote Store ضد-دستکاری (18-pricing-service) =====
const { createRedisClient } = require('../18-pricing-service/infrastructure/redisClient');
const DemandSupplyTracker = require('../18-pricing-service/infrastructure/DemandSupplyTracker').DemandSupplyTracker;
const CalculateFareUseCase = require('../18-pricing-service/application/CalculateFareUseCase').CalculateFareUseCase;
const { FareQuoteStore } = require('../18-pricing-service/infrastructure/FareQuoteStore');
// P2-1 (Event-Driven): انتشار رویدادهای دامنه سفر روی EventBus مرکزی
// (بدون وابستگی مستقیم Mobility به Wallet). امضای Envelope مرکزی:
// { event, data, timestamp } — بنابراین adapter باید (event, data) را بگیرد.
const mobilityEventBus = require('../16-mobility-engine/infrastructure/events/event-bus');
const emitTripEvent = (event, data) => mobilityEventBus.publish(event, data);
const pricingRedisClient = createRedisClient();
const demandSupplyTracker = new DemandSupplyTracker(pricingRedisClient);
const fareQuoteStore = new FareQuoteStore(pricingRedisClient);
const createTripUseCase = new CreateTripUseCase({ tripRepository, pricingRepository, emitEvent: emitTripEvent, fareQuoteStore });
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

// ===== تخمین قیمت داینامیک سفر (18-pricing-service, P6-1/P6-2) =====
// (P10-1) DynamicConfigStore برای خواندن تنظیمات پویا از Redis به جای config استاتیک
const { DynamicConfigStore } = require('../14-config-system/infrastructure/DynamicConfigStore');
const dynamicConfigStore = new DynamicConfigStore({
  redisClient: pricingRedisClient,
  defaults: {
    'trip.baseFare': parseFloat((config.trip || {}).baseFare) || 15000,
    'trip.perKmRate': parseFloat((config.trip || {}).perKmRate) || 2000,
    'trip.maxSurge': parseFloat((config.trip || {}).maxSurge) || 2.0,
  },
});

// (P10-2) سرویس تخفیف — ValidatePromoUseCase با مدلهای Promo و قفل توزیع‌شده Redeis
let validatePromoUseCase = null;
try {
  const { Pool } = require('pg');
  const promoPool = new Pool({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    max: 5,
    connectionTimeoutMillis: 2000,
  });
  const { PromoCode } = require('../23-promo-service/models/PromoCode');
  const { PromoUsage } = require('../23-promo-service/models/PromoUsage');
  const { ValidatePromoUseCase } = require('../23-promo-service/application/ValidatePromoUseCase');
  const { TripCompletedHandler } = require('../23-promo-service/handlers/TripCompleted.handler');
  validatePromoUseCase = new ValidatePromoUseCase({
    promoCodeModel: new PromoCode(promoPool),
    promoUsageModel: new PromoUsage(promoPool),
    redisClient: pricingRedisClient,
  });
  // ثبت نهایی مصرف کد تخفیف در پایان سفر
  const tripCompletedHandler = new TripCompletedHandler({
    promoCodeModel: new PromoCode(promoPool),
    promoUsageModel: new PromoUsage(promoPool),
    pool: promoPool,
    eventBus: mobilityEventBus,
  });
  tripCompletedHandler.subscribe();
} catch (err) {
  // اگر پایگاه داده/وابستگی در دسترس نبود، تخفیف فعال نمیشود ولی سرویس قیمت سالم میماند.
  console.warn('[gateway] Promo service unavailable:', err.message);
}
const calculateFareUseCase = new CalculateFareUseCase({ demandSupplyTracker, fareQuoteStore, dynamicConfigStore, promoService: validatePromoUseCase });

// (P10-1) مسیرهای مدیریت تنظیمات پویا (22-admin-service)
const { createConfigRoutes } = require('../22-admin-service/routes/config.routes');
const { ConfigController } = require('../22-admin-service/controllers/ConfigController');
const configController = new ConfigController({
  configStore: dynamicConfigStore,
  editableKeys: ['trip.baseFare', 'trip.perKmRate', 'trip.maxSurge', 'wallet.currency'],
});
const adminConfigRoutes = createConfigRoutes({
  configController,
  authenticate,
  authorize,
});
router.use('/api/v1/admin/configs', adminConfigRoutes);

// عمومی: مسافر پیش از درخواست سفر، قیمت برآوردی و ضریب surge را می‌بیند
router.get('/api/v1/trip/estimate', async (req, res) => {
  const oLat = Number(req.query.originLat);
  const oLng = Number(req.query.originLng);
  const dLat = Number(req.query.destLat);
  const dLng = Number(req.query.destLng);
  const promoCode = req.query.promoCode ? String(req.query.promoCode) : null;
  try {
    const result = await calculateFareUseCase.execute({
      originLat: oLat,
      originLng: oLng,
      destLat: dLat,
      destLng: dLng,
      promoCode,
    });
    // ثبت تقاضای منطقه مبدأ در پس‌زمینه (fire-and-forget؛ عدم block کردن پاسخ)
    if (Number.isFinite(oLat) && Number.isFinite(oLng)) {
      demandSupplyTracker.recordDemand(oLat, oLng).catch(() => {});
    }
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, error: error.message });
  }
});

// ===== نقشه حرارتی مناطق پرتقاضا (P6-2) — مخصوص رانندگان =====
// مناطقی که surgeMultiplier > 1.0 دارند به همراه ضریب هر منطقه.
router.get('/api/v1/pricing/heatmap', authenticate, async (req, res) => {
  try {
    const zones = await demandSupplyTracker.getActiveSurgeZones();
    return res.status(200).json({ success: true, data: zones });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});
// ===== مسیرهای سلامت =====
const healthRoute = require('./routes/health.route');
router.use('/api/v1', healthRoute);

module.exports = router;

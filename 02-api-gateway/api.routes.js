/**
 * api.routes.js - مسیر متمرکز API Gateway
 * 
 * طبق بند ۷ سند مادر: نقطه ورود تمام درخواست‌ها
 * هیچ ماژولی مستقیماً Route خود را به app.js نمی‌دهد
 * همه چیز از این Gateway عبور می‌کند
 */

const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const { getPool } = require('../01-core-system/database/db');
// (FIX/P0) پیکربندی مرکزی سرویس — پیش‌تر این فایل از `config.trip` (خط ۳۰۳) و
// `config.pg` (خطوط ۳۱۴–۳۱۸) استفاده می‌کرد بدون آنکه `config` را import کند؛
// همین باعث `ReferenceError: config is not defined` و کرش کامل بوت Gateway
// (و در نتیجه کرش `01-core-system/app.js` که این فایل را require می‌کند) می‌شد.
const config = require('../14-config-system/server.config');
const router = express.Router();

// ===== کمک‌تابع‌های پروکسی (اصلاح 404) =====
// نکته کلیدی: Express در `router.use('<mount>', proxy)` پیشوند mount را از `req.url`
// حذف می‌کند؛ بنابراین بازنویسی مسیر باید پیشوند سرویس مقصد را «دقیقاً یک‌بار» بازگرداند
// و هیچ بخش ضروری دیگری از URL (sub-path یا query string) را حذف/تغییر ندهد.
function rewriteToServicePrefix(prefix) {
  return (path) => {
    const raw = typeof path === 'string' && path.length ? path : '/';
    const qIndex = raw.indexOf('?');
    const pathname = qIndex === -1 ? raw : raw.slice(0, qIndex);
    const query = qIndex === -1 ? '' : raw.slice(qIndex);

    let target = pathname;
    if (!pathname.startsWith(prefix)) {
      target = pathname === '/' || pathname === ''
        ? prefix
        : `${prefix}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
    }
    // سرویس‌های مقصد بدون اسلش انتهایی مسیرگذاری شده‌اند → حذف اسلش انتهایی اضافی
    if (target.length > 1 && target.endsWith('/')) target = target.replace(/\/+$/, '');

    return `${target}${query}`;
  };
}

// خطای پروکسی (مثلاً سرویس مقصد پایین است) → 502 روشن، نه 404 گمراه‌کننده
function proxyErrorHandler(serviceName) {
  return (err, req, res) => {
    console.error(`[gateway] proxy error (${serviceName}):`, err.message);
    if (res && !res.headersSent && typeof res.status === 'function') {
      return res.status(502).json({
        success: false,
        status_code: 502,
        message: `${serviceName} service unavailable`,
      });
    }
    return undefined;
  };
}

// ===== RBAC: میان‌افزار امنیتی و کنترل دسترسی مرکزی (17-rbac-service) =====
// authenticate: توکن RS256 (Bearer یا کوکی HttpOnly) → req.user
// authorize:   بررسی مجوز granular (مثل 'users.read') یا نقش (مثل 'admin')
const { authenticate, authorize } = require('../17-rbac-service/presentation/middleware/rbac.middleware');
const { RbacModule } = require('../17-rbac-service/index');
// (P11-1) احراز هویت Stateless با توکن IAM — وریفای RS256 با public.pem
const { authenticate: iamAuthenticate } = require('../02-api-gateway/middlewares/auth.middleware');
const { createAuthRoutes: createIamAuthRoutes } = require('../24-iam-service/routes/auth.routes');
// (P11-2) میدلور مجوزدهی/سیاست ABAC با موتور PolicyEngine
const { authorize: iamAuthorize } = require('../02-api-gateway/middlewares/authorize.middleware');

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

// ===== IAM: صدور و چرخش توکن (24-iam-service, P11-1) =====
// ساخت AuthService (کلید خصوصی RSA) — redis در time of use دوباره تنظیم می‌شود
const { AuthService } = require('../24-iam-service/application/AuthService');
const iamAuthRoutes = createIamAuthRoutes({
  authService: new AuthService({ issuer: 'safar-iam' }),
  logger: console,
});
router.use('/api/v1/auth', iamAuthRoutes);

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
// مسیرهای سرویس مقصد: /api/v1/marketplace/products | /products/:id | /health
const marketplaceProxy = createProxyMiddleware({
  target: process.env.MARKETPLACE_URL || 'http://localhost:3012',
  changeOrigin: true,
  logLevel: 'warn',
  pathRewrite: rewriteToServicePrefix('/api/v1/marketplace'),
  on: {
    // بدنه‌ی خوانده‌شده توسط express.json() در 01-core-system/app.js دوباره
    // به سرویس مقصد فرستاده می‌شود (در غیر این صورت درخواست‌های POST معلق می‌مانند).
    proxyReq: fixRequestBody,
    error: proxyErrorHandler('marketplace'),
  },
});
router.use('/api/v1/marketplace', marketplaceProxy);

// ===== مسیرهای تبلیغات (10-ads-service) =====
// تبلیغات روی 3013 — جدا از سایر سرویس‌ها
// مسیرهای سرویس مقصد: /api/v1/ads/campaigns | /campaigns/:id | /health
const adsProxy = createProxyMiddleware({
  target: process.env.ADS_URL || 'http://localhost:3013',
  changeOrigin: true,
  logLevel: 'warn',
  pathRewrite: rewriteToServicePrefix('/api/v1/ads'),
  on: {
    proxyReq: fixRequestBody,
    error: proxyErrorHandler('ads'),
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
// (P13-2) پیشنهاد سفر + قفل توزیعشده روی Redis
const TripOfferRepository = require('../16-mobility-engine/infrastructure/redis/TripOfferRepository');

const tripPool = getPool();
// (P12) Outbox: هر رویداد دامنه در همان تراکنش تغییر وضعیت ثبت و سپس توسط
// OutboxRelay به EventBus منتشر می‌شود (Transactional Outbox).
const { OutboxRepository } = require('../00-infrastructure/events/OutboxRepository');
const outboxRepository = new OutboxRepository({ pool: tripPool });
const tripRepository = new TripRepository(tripPool, { outboxRepository });
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
const acceptTripUseCase = new AcceptTripUseCase({
  tripRepository,
  emitEvent: emitTripEvent,
  // (P13-2) پیشنهاد سفر + قفل توزیع‌شده روی Redis (SETNX)
  tripOfferRepository: new TripOfferRepository({ redisClient: pricingRedisClient }),
});
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
// (P11-1) لایه‌ی احراز هویت Stateless (IAM) پیش از RBAC — توکن Bearer با public.pem وریفای می‌شود
router.use('/api/v1/trips', iamAuthenticate, authenticate, tripRouter);

// (P11-2) خواندن یک سفر با سیاست ABAC (trip:read:own)
// fetchTripById منبع را از دیتابیس می‌خواند تا سیاست مالکیت مسافر/راننده اعمال شود.
async function fetchTripById(tripId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, passenger_id, driver_id FROM trips WHERE id = $1',
    [tripId]
  );
  const row = rows && rows[0];
  if (!row) throw new Error('trip not found');
  return {
    id: row.id,
    passengerId: row.passenger_id,
    driverId: row.driver_id,
  };
}
router.get(
  '/api/v1/trips/:id',
  iamAuthenticate,
  iamAuthorize('trip:read:own', async (req) => fetchTripById(req.params.id)),
  async (req, res) => {
    // پس از عبور authorize، منبع در req.resource موجود است
    const resource = req.resource;
    if (!resource) return res.status(404).json({ success: false, error: 'trip not found' });
    // در فاز حاضر فقط ابرداری مجوز (شاذنه) گزارش می‌شود؛ هندلر کامل خواندن در فاز بعدی.
    return res.status(200).json({ success: true, data: { tripId: resource.id } });
  }
);

// ===== (P13-1) مسیرهای مکانیابی رانندگان — 17-location-service =====
// POST /api/v1/location/update : ثبت/به‌روزرسانی موقعیت راننده در Redis GEO (GEOADD + TTL)
// GET  /api/v1/location/nearby : جستجوی رانندگان اطراف (GEOSEARCH + WITHDIST ASC)
// امنیت: iamAuthenticate (RS256) + iamAuthorize('driver:location:update') برای راننده
const { RedisGeoRepository } = require('../17-location-service/infrastructure/RedisGeoRepository');
const { FindNearbyDriversUseCase } = require('../17-location-service/application/FindNearbyDriversUseCase');
const { createLocationRoutes } = require('../17-location-service/routes/location.routes');
const geoRepository = new RedisGeoRepository({ redisClient: pricingRedisClient });
const locationRoutes = createLocationRoutes({
  geoRepository,
  findNearbyDriversUseCase: new FindNearbyDriversUseCase({ geoRepository }),
  iamAuthenticate,
  authorize: iamAuthorize,
  logger: console,
});
router.use('/api/v1/location', locationRoutes);

// ===== (P13-2) مسیرهای توزیع سفر — 16-mobility-engine =====
// POST /api/v1/dispatch/trips/:tripId/accept
// امنیت: iamAuthenticate (RS256) + الزام نقش DRIVER؛ driverId از توکن استخراج میشود.
const { createDispatchRoutes } = require('../16-mobility-engine/routes/dispatch.routes');
const dispatchRoutes = createDispatchRoutes({
  acceptTripUseCase,
  iamAuthenticate,
  logger: console,
});
router.use('/api/v1/dispatch', dispatchRoutes);

// ===== (P12) Worker جدول Outbox (اختیاری — بهصورت پیشفرض خاموش) =====
// انتشار تضمینشده رویدادهای ثبتشده در `outbox_events` روی EventBus.
// در محیط production با OUTBOX_RELAY_ENABLED=true فعال میشود.
if (String(process.env.OUTBOX_RELAY_ENABLED || '').toLowerCase() === 'true') {
  const OutboxRelay = require('../01-core-system/OutboxRelay');
  const outboxRelay = new OutboxRelay({
    outboxRepository,
    eventBus: mobilityEventBus,
    logger: console,
  });
  outboxRelay.start();
  console.log('[gateway] OutboxRelay started (interval 1s)');
}

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
  // (P11-2) سیاست ABAC: احراز هویت Stateless (IAM) + مجوز admin:config:write
  authenticate: iamAuthenticate,
  authorize: (_, _extractor) => iamAuthorize('admin:config:write'),
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

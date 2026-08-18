/**
 * AuthLoginToOperations.e2e.test.js
 *
 * تست End-to-End جامع «تکمیل زنجیره یکپارچگی»:
 *   1) درخواست و تأیید OTP برای شماره موبایل (ورود کاربر)
 *   2) دریافت توکن دسترسی معتبر (RS256 / JwtService)
 *   3) استفاده مستقیم از همان توکن در درخواست‌های محافظت‌شده:
 *        - GET  /api/v1/profile              (پروفایل)          -> 200
 *        - POST /api/v1/marketplace/products  (ثبت محصول - Seller) -> 201
 *        - POST /api/v1/ads/campaigns         (ایجاد کمپین - Advertiser) -> 201
 *
 * یک توکن صادرشده از OTP باید در همه‌ی این مسیرها معتبر باشد و
 * احراز هویت/RBAC هر سرویس آن را بپذیرد.
 *
 * نیازمند PostgreSQL زنده؛ در نبود DB تست‌ها به‌صورت ایمن skip می‌شوند.
 */

require('dotenv').config();
const request = require('supertest');
const { Pool } = require('pg');

const authApp = require('../../../13-auth-management/run-server');
const marketplaceApp = require('../../../09-marketplace/run-server');
const adsApp = require('../../../10-ads-service/run-server');
const JwtService = require('../../../13-auth-management/domain/services/JwtService');

const dbPool = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: +process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'safar_service',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  connectionTimeoutMillis: 3000,
});

async function isDbAvailable() {
  try {
    await dbPool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function freshPhone() {
  return '+9891' + String(Date.now()).slice(-8);
}

async function waitForRow(table, userId, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await dbPool.query(`SELECT id FROM ${table} WHERE user_id = $1`, [userId]);
      if (r.rows.length) return r.rows[0];
    } catch {
      /* ignore transient errors */
    }
    await new Promise((res) => setTimeout(res, 120));
  }
  return null;
}

// ثبت کاربر با نقش مشخص؛ پروفایل کسب‌وکار (sellers/advertisers) هم ساخته می‌شود
async function registerUser(role) {
  const phoneNumber = freshPhone();
  const res = await request(authApp)
    .post('/api/v1/auth/register')
    .send({
      phoneNumber,
      firstName: 'E2E',
      lastName: role === 'seller' ? 'Seller' : 'Advertiser',
      password: 'Secret123!',
      role,
      email: `${role}_${Date.now()}@example.com`,
    });
  return { status: res.status, userId: res.body && res.body.data && res.body.data.id, phoneNumber };
}

// ثبت‌نام اولیه + انتظار ساخت پروفایل + ورود با OTP برای همان شماره
async function registerAndLogin(role) {
  const reg = await registerUser(role);
  expect(reg.status).toBe(201);
  expect(reg.userId).toBeTruthy();

  const row = await waitForRow(role === 'seller' ? 'sellers' : 'advertisers', reg.userId);
  expect(row).toBeTruthy();

  const otpRes = await request(authApp).post('/api/v1/auth/request-otp').send({ phoneNumber: reg.phoneNumber });
  expect(otpRes.status).toBe(200);
  const otpCode = otpRes.body.data && otpRes.body.data.otpCode;
  expect(otpCode).toBeTruthy();

  const verifyRes = await request(authApp)
    .post('/api/v1/auth/verify-otp')
    .send({ phoneNumber: reg.phoneNumber, otpCode });
  expect(verifyRes.status).toBe(200);
  expect(verifyRes.body.data).toHaveProperty('token');

  const decoded = new JwtService().verifyAccessToken(verifyRes.body.data.token);
  expect(decoded).toHaveProperty('userId', reg.userId);
  expect(decoded).toHaveProperty('role', role);
  expect(decoded).toHaveProperty('type', 'access');

  return { ...reg, token: verifyRes.body.data.token };
}
describe('E2E: OTP login -> the SAME token works across protected services (live Postgres)', () => {
  let dbUp = false;
  const createdSellers = [];
  const createdAdvertisers = [];

  beforeAll(async () => {
    dbUp = await isDbAvailable();
  }, 10000);

  // ============================================================
  // سناریوی Seller: پروفایل + ایجاد محصول با همان توکن OTP
  // ============================================================
  describe('Seller flow', () => {
    let seller;

    beforeAll(async () => {
      if (!dbUp) return;
      seller = await registerAndLogin('seller');
      createdSellers.push(seller.userId);
    }, 25000);

    test('GET /api/v1/profile returns 200 with the same OTP token', async () => {
      if (!dbUp) return;
      const res = await request(authApp)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${seller.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    }, 15000);

    test('POST /api/v1/marketplace/products returns 201 with the same OTP token', async () => {
      if (!dbUp) return;
      const res = await request(marketplaceApp)
        .post('/api/v1/marketplace/products')
        .set('Authorization', `Bearer ${seller.token}`)
        .send({ name: 'Seed Product', price: 150, quantity: 2, description: 'from OTP login e2e' });
      expect(res.status).toBe(201);
      expect(res.body.data.sellerId).toBe(seller.userId);
    }, 15000);
  });

  // ============================================================
  // سناریوی Advertiser: ایجاد کمپین با همان توکن OTP
  // ============================================================
  describe('Advertiser flow', () => {
    let advertiser;

    beforeAll(async () => {
      if (!dbUp) return;
      advertiser = await registerAndLogin('advertiser');
      createdAdvertisers.push(advertiser.userId);
    }, 25000);

    test('POST /api/v1/ads/campaigns returns 201 with the same OTP token', async () => {
      if (!dbUp) return;
      const res = await request(adsApp)
        .post('/api/v1/ads/campaigns')
        .set('Authorization', `Bearer ${advertiser.token}`)
        .send({
          name: 'E2E Campaign',
          description: 'from OTP login',
          budget: 50000,
          startDate: '2026-09-01',
          endDate: '2026-12-31',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.advertiserId).toBe(advertiser.userId);
    }, 15000);
  });

  afterAll(async () => {
    if (!dbUp) return;
    try {
      for (const sellerId of createdSellers) {
        await dbPool.query('DELETE FROM products WHERE seller_id = $1', [sellerId]);
        await dbPool.query('DELETE FROM sellers WHERE user_id = $1', [sellerId]);
      }
      for (const advertiserId of createdAdvertisers) {
        await dbPool.query('DELETE FROM ads WHERE advertiser_id = $1', [advertiserId]);
        await dbPool.query('DELETE FROM campaigns WHERE advertiser_id = $1', [advertiserId]);
        await dbPool.query('DELETE FROM advertisers WHERE user_id = $1', [advertiserId]);
      }
      const userIds = [...createdSellers, ...createdAdvertisers];
      for (const userId of userIds) {
        await dbPool.query('DELETE FROM users WHERE id = $1', [userId]);
      }
    } catch (e) {
      console.warn('[cleanup]', e.message);
    } finally {
      await dbPool.end();
    }
  }, 15000);
});
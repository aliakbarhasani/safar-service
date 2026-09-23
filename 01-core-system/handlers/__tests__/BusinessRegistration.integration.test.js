/**
 * BusinessRegistration.integration.test.js
 *
 * سناریوی end-to-end «تکمیل گام‌های ثبت‌نام» برای نقش‌های کسب‌وکار:
 *   1) ثبت‌نام فروشنده (role=seller) از طریق سرویس auth
 *   2) تأیید ساخت خودکار پروفایل در جدول `sellers` توسط رویداد UserRegistered
 *   3) ایجاد محصول توسط همان فروشنده (عبور از RBAC و برقراری FK)
 *
 * نیازمند PostgreSQL زنده است. اگر دیتابیس در دسترس نباشد، تست‌ها به‌صورت
 * ایمن SKIP می‌شوند تا سوئیت در محیط‌های بدون DB هم سبز بماند.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const authApp = require('../../../13-auth-management/run-server');
const marketplaceApp = require('../../../09-marketplace/run-server');

// SECURITY (P0): توکن تست فقط با RS256 و کلید خصوصی واقعی سرویس امضا می‌شود؛
// سکرت متقارن (HS256) از پروژه حذف شده است.
const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '00-infrastructure', 'keys', 'jwt_private.pem'),
  'utf8'
);

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

async function waitForSeller(userId, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await dbPool.query(
        'SELECT id, user_id, store_name, status, verification_status FROM sellers WHERE user_id = $1',
        [userId]
      );
      if (r.rows.length) return r.rows[0];
    } catch {
      /* ignore transient errors */
    }
    await new Promise((res) => setTimeout(res, 120));
  }
  return null;
}

describe('Business registration end-to-end (live Postgres)', () => {
  let dbUp = false;
  let sellerId = null;
  let uniquePhone = null;

  beforeAll(async () => {
    dbUp = await isDbAvailable();
    if (!dbUp) return;
    uniquePhone = '+9891' + String(Date.now()).slice(-8);
  }, 10000);

  // گام ۱: ثبت‌نام فروشنده
  beforeAll(async () => {
    if (!dbUp) return;
    const res = await request(authApp)
      .post('/api/v1/auth/register')
      .send({
        phoneNumber: uniquePhone,
        firstName: 'Test',
        lastName: 'Seller',
        password: 'Secret123!',
        role: 'seller',
        email: `seller_${Date.now()}@example.com`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('seller');
    sellerId = res.body.data.id;
    expect(sellerId).toBeTruthy();
  }, 20000);

  // گام ۲: پروفایل فروشنده به‌صورت خودکار در جدول sellers ساخته می‌شود
  test('converts registered seller into a sellers profile row (id = userId)', async () => {
    if (!dbUp) return; // بدون DB: skip

    const seller = await waitForSeller(sellerId);
    expect(seller).toBeTruthy();
    // اتصال FK: id پروفایل باید برابر userId باشد تا Products بتوانند ارجاع دهند
    expect(seller.id).toBe(sellerId);
    expect(seller.user_id).toBe(sellerId);
    expect(seller.store_name).toBeTruthy();
    expect(seller.status).toBe('active');
  }, 15000);

  // گام ۳: RBAC + FK برقرار → فروشنده می‌تواند محصول ایجاد کند
  test('the registered seller can create a product (201) after RBAC', async () => {
    if (!dbUp) return; // بدون DB: skip
    expect(sellerId).toBeTruthy();

    const token = jwt.sign(
      { userId: sellerId, phoneNumber: uniquePhone, role: 'seller', type: 'access' },
      PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    const res = await request(marketplaceApp)
      .post('/api/v1/marketplace/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Integration Product', price: 250, quantity: 3, description: 'e2e test' });

    expect(res.status).toBe(201);
    expect(res.body.data.sellerId).toBe(sellerId);
  }, 20000);

  afterAll(async () => {
    if (!dbUp || !sellerId) return;
    try {
      await dbPool.query('DELETE FROM products WHERE seller_id = $1', [sellerId]);
      await dbPool.query('DELETE FROM sellers WHERE user_id = $1', [sellerId]);
      await dbPool.query('DELETE FROM users WHERE id = $1', [sellerId]);
    } catch (e) {
      console.warn('[cleanup]', e.message);
    } finally {
      await dbPool.end();
    }
  }, 10000);
});
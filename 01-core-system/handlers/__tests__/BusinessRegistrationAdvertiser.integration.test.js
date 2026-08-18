/**
 * BusinessRegistrationAdvertiser.integration.test.js
 *
 * سناریوی end-to-end «تکمیل گام‌های ثبت‌نام» برای نقش Advertiser:
 *   1) ثبت‌نام تبلیغ‌کننده (role=advertiser) از طریق سرویس auth        -> 201
 *   2) ساخت خودکار پروفایل در جدول `advertisers` توسط رویداد UserRegistered
 *   3) ایجاد کمپین تبلیغاتی (POST /api/v1/ads/campaigns) پس از عبور RBAC -> 201
 *
 * نیازمند PostgreSQL زنده است؛ در نبود DB تست‌ها به‌صورت ایمن skip می‌شوند.
 */

require('dotenv').config();
const request = require('supertest');
const { Pool } = require('pg');

const authApp = require('../../../13-auth-management/run-server');
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

async function waitForAdvertiser(userId, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await dbPool.query(
        'SELECT id, user_id, company_name, status, verification_status FROM advertisers WHERE user_id = $1',
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

describe('Advertiser registration end-to-end (live Postgres)', () => {
  let dbUp = false;
  let advertiserId = null;
  let uniquePhone = null;

  beforeAll(async () => {
    dbUp = await isDbAvailable();
    if (!dbUp) return;
    uniquePhone = '+9891' + String(Date.now()).slice(-8);
  }, 10000);

  // گام ۱: ثبت‌نام تبلیغ‌کننده
  beforeAll(async () => {
    if (!dbUp) return;
    const res = await request(authApp)
      .post('/api/v1/auth/register')
      .send({
        phoneNumber: uniquePhone,
        firstName: 'Test',
        lastName: 'Advertiser',
        password: 'Secret123!',
        role: 'advertiser',
        email: `advertiser_${Date.now()}@example.com`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('advertiser');
    advertiserId = res.body.data.id;
    expect(advertiserId).toBeTruthy();
  }, 20000);

  // گام ۲: پروفایل تبلیغ‌کننده به‌صورت خودکار در جدول advertisers ساخته می‌شود
  test('converts registered advertiser into an advertisers profile row (id = userId)', async () => {
    if (!dbUp) return; // بدون DB: skip

    const adv = await waitForAdvertiser(advertiserId);
    expect(adv).toBeTruthy();
    // اتصال FK: id پروفایل باید برابر userId باشد تا Campaigns بتوانند ارجاع دهند
    expect(adv.id).toBe(advertiserId);
    expect(adv.user_id).toBe(advertiserId);
    expect(adv.company_name).toBeTruthy();
    expect(adv.status).toBe('active');
  }, 15000);

  // گام ۳: RBAC + FK برقرار → تبلیغ‌کننده می‌تواند کمپین ایجاد کند (توکن RS256/کانونی)
  test('the registered advertiser can create a campaign (201) after RBAC', async () => {
    if (!dbUp) return; // بدون DB: skip
    expect(advertiserId).toBeTruthy();

    // توکن کانونی RS256 (JwtService) - اثبات سازگاری middleware سرویس ads
    const token = new JwtService().generateAccessToken({
      id: advertiserId,
      phoneNumber: uniquePhone,
      role: 'advertiser',
    });

    const res = await request(adsApp)
      .post('/api/v1/ads/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Integration Campaign',
        description: 'e2e advertiser test',
        budget: 100000,
        startDate: '2026-09-01',
        endDate: '2026-12-31',
        targetingCriteria: { regions: ['Kabul'], ageMin: 18 },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.advertiserId).toBe(advertiserId);
  }, 20000);

  afterAll(async () => {
    if (!dbUp || !advertiserId) return;
    try {
      await dbPool.query('DELETE FROM ads WHERE advertiser_id = $1', [advertiserId]);
      await dbPool.query('DELETE FROM campaigns WHERE advertiser_id = $1', [advertiserId]);
      await dbPool.query('DELETE FROM advertisers WHERE user_id = $1', [advertiserId]);
      await dbPool.query('DELETE FROM users WHERE id = $1', [advertiserId]);
    } catch (e) {
      console.warn('[cleanup]', e.message);
    } finally {
      await dbPool.end();
    }
  }, 10000);
});
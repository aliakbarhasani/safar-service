/**
 * rbac-campaign.test.js
 *
 * تست دسترسی نقش‌محور (RBAC) برای مسیر ایجاد کمپین در سرویس Ads.
 * فقط کاربران دارای نقش advertiser (یا مدیران) که پروفایل Advertiser دارند مجازند.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../run-server');
const config = require('../../14-config-system/server.config');

const USER_ID = '22222222-2222-2222-2222-222222222222';

function signToken(role) {
  return jwt.sign(
    { userId: USER_ID, phoneNumber: '+989120000020', role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );
}

describe('Ads Campaign Create - RBAC', () => {
  const payload = { name: 'Test Campaign', budget: 1000 };

  test('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/v1/ads/campaigns').send(payload);
    expect(res.status).toBe(401);
  });

  test('returns 403 for a passenger (non-advertiser) role', async () => {
    const res = await request(app)
      .post('/api/v1/ads/campaigns')
      .set('Authorization', `Bearer ${signToken('passenger')}`)
      .send(payload);
    expect(res.status).toBe(403);
  });

  test('does NOT block an advertiser: passes RBAC (never 401/403)', async () => {
    const res = await request(app)
      .post('/api/v1/ads/campaigns')
      .set('Authorization', `Bearer ${signToken('advertiser')}`)
      .send(payload);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
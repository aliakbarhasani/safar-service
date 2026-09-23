/**
 * rbac-campaign.test.js
 *
 * تست دسترسی نقش‌محور (RBAC) برای مسیر ایجاد کمپین در سرویس Ads.
 * فقط کاربران دارای نقش advertiser (یا مدیران) که پروفایل Advertiser دارند مجازند.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../run-server');

const USER_ID = '22222222-2222-2222-2222-222222222222';

// SECURITY (P0): توکن تست فقط با الگوریتم RS256 و کلید خصوصی واقعی سرویس امضا می‌شود؛
// سکرت متقارن (HS256) از پروژه حذف شده است.
const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '00-infrastructure', 'keys', 'jwt_private.pem'),
  'utf8'
);

function signToken(role) {
  return jwt.sign(
    { userId: USER_ID, phoneNumber: '+989120000020', role, type: 'access' },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '1h' }
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
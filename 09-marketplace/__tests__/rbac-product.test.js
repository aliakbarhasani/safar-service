/**
 * rbac-product.test.js
 *
 * تست دسترسی نقش‌محور (RBAC) برای مسیر ایجاد محصول در سرویس Marketplace.
 * فقط کاربران دارای نقش seller (یا مدیران) که پروفایل Seller دارند مجازند.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../run-server');

const USER_ID = '11111111-1111-1111-1111-111111111111';

// SECURITY (P0): توکن تست فقط با الگوریتم RS256 و کلید خصوصی واقعی سرویس امضا می‌شود؛
// سکرت متقارن (HS256) از پروژه حذف شده است.
const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '00-infrastructure', 'keys', 'jwt_private.pem'),
  'utf8'
);

function signToken(role) {
  return jwt.sign(
    { userId: USER_ID, phoneNumber: '+989120000010', role, type: 'access' },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Marketplace Product Create - RBAC', () => {
  const payload = { name: 'Test Product', price: 100, quantity: 5 };

  test('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/v1/marketplace/products').send(payload);
    expect(res.status).toBe(401);
  });

  test('returns 403 for a passenger (non-seller) role', async () => {
    const res = await request(app)
      .post('/api/v1/marketplace/products')
      .set('Authorization', `Bearer ${signToken('passenger')}`)
      .send(payload);
    expect(res.status).toBe(403);
  });

  test('does NOT block a seller: passes RBAC (never 401/403)', async () => {
    const res = await request(app)
      .post('/api/v1/marketplace/products')
      .set('Authorization', `Bearer ${signToken('seller')}`)
      .send(payload);
    // اگر RBAC درست جواب بدهد، درخواست به کنترلر می‌رسد؛ نتیجه آن 400 (DB) یا 201 است، نه 403/401
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
'use strict';

/**
 * authorize.middleware.test.js - API Gateway (P11-2)
 *
 * اعتبارسنجی موتور مجوزدهی/سیاست ABAC (RBAC + مالکیت منبع) از طریق
 * میدلور `authorize` (Higher-Order):
 *   - رد (403) وقتی کاربر مجوز لازم را ندارد.
 *   - رد (403) وقتی کاربر مجوز را دارد ولی مالک منبع نیست.
 *   - قبول (next) وقتی کاربر مالک منبع است یا نقش SUPER_ADMIN دارد.
 *
 * برای این منظور از PolicyEngine واقعی (24-iam-service/domain) استفاده می‌شود؛
 * مجوزهای نقش از ماتریس roles.js می‌آیند.
 */

const { authorize } = require('../middlewares/authorize.middleware');
const { ROLES } = require('../../24-iam-service/domain/roles');

function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); }

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

/**
 * میدلور را با یک کاربر و منبع شبیه‌سازی اجرا می‌کند.
 * @param {Function} mw - میدلور مرتبه‌بالا (authorize(...))
 * @param {Object} user - req.user
 * @param {Object} [resource] - منبع برای resourceExtractor
 * @returns {Promise<{ statusCode, body, nextCalled, req }>}
 */
async function runMw(mw, user, resource = null) {
  const req = { user, params: {}, query: {}, body: {}, headers: {} };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });
  return { statusCode: res.statusCode, body: res.body, nextCalled, req };
}

// ---------- تست‌ها ----------

test('403: user without required permission is denied', async () => {
  // FLEET_MANAGER — در ماتریس مجوز trip:read:own ندارد
  const mw = authorize('trip:read:own', () => ({ passengerId: 'u-other', driverId: null }));
  const { statusCode, nextCalled } = await runMw(mw, { id: 'fleet-1', role: ROLES.FLEET_MANAGER });
  assert(statusCode === 403, `expected 403, got ${statusCode}`);
  assert(nextCalled === false, 'next() should not be called');
  passed++;
});

test('403: user has permission but is NOT resource owner (ABAC)', async () => {
  // مسافرِ دارای مجوز trip:read:own ولی منبع متعلق به دیگری
  const mw = authorize('trip:read:own', () => ({ passengerId: 'u-other', driverId: 'd-other' }));
  const { statusCode, nextCalled } = await runMw(mw, { id: 'u-1', role: ROLES.PASSENGER });
  assert(statusCode === 403, `expected 403, got ${statusCode}`);
  assert(nextCalled === false, 'next() should not be called');
  passed++;
});

test('200/next: resource owner (passenger) is allowed', async () => {
  const mw = authorize('trip:read:own', () => ({ passengerId: 'u-1', driverId: null }));
  const { statusCode, nextCalled } = await runMw(mw, { id: 'u-1', role: ROLES.PASSENGER });
  assert(nextCalled === true, 'next() should be called for owner');
  assert(statusCode == null, `no error status expected, got ${statusCode}`);
  passed++;
});

test('200/next: driver of the trip is allowed (ownership via driverId)', async () => {
  const mw = authorize('trip:read:own', () => ({ passengerId: 'u-x', driverId: 'd-7' }));
  const { statusCode, nextCalled } = await runMw(mw, { id: 'd-7', role: ROLES.DRIVER });
  assert(nextCalled === true, 'driver owner should be allowed');
  assert(statusCode == null, `no error status expected, got ${statusCode}`);
  passed++;
});

test('200/next: SUPER_ADMIN bypasses ownership for any permission', async () => {
  const mw = authorize('trip:read:own', () => ({ passengerId: 'u-other', driverId: null }));
  const { statusCode, nextCalled } = await runMw(mw, { id: 'root', role: ROLES.SUPER_ADMIN });
  assert(nextCalled === true, 'super_admin should be allowed');
  assert(statusCode == null, `no error status expected, got ${statusCode}`);
  passed++;
});

test('401: no authenticated user (no req.user)', async () => {
  const mw = authorize('trip:read:own', () => ({ passengerId: 'u-1', driverId: null }));
  const { statusCode, nextCalled } = await runMw(mw, null);
  assert(statusCode === 401, `expected 401, got ${statusCode}`);
  assert(nextCalled === false, 'next() should not be called');
  passed++;
});

// ---------- اجرای تست‌ها ----------
(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`  ✕ ${t.name}\n      ${err.message}`);
    }
  }
  console.log(`\nTests: ${tests.length} total, ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
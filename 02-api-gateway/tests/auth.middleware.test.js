'use strict';

/**
 * auth.middleware.test.js - API Gateway (P11-1)
 *
 * اعتبارسنجی Stateless verification:
 * توکنی که AuthService (کلید خصوصی RSA-2048) امضا می‌کند، باید توسط میدلور
 * `authenticate` (کلید عمومی public.pem) در Gateway وریفای شود و `req.user`
 * را بسازد؛ توکن نامعتبر/تغییرشده → 401.
 */

const jwt = require('jsonwebtoken');
const { AuthService } = require('../../24-iam-service/application/AuthService');
const { authenticate } = require('../middlewares/auth.middleware');

function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); }

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const authService = new AuthService({ issuer: 'safar-iam' });

async function runMiddlewareWith(middleware, req) {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  await new Promise((r) => setTimeout(r, 60));
  return { statusCode: res.statusCode, body: res.body, nextCalled };
}

test('valid RS256 token -> sets req.user and calls next()', async () => {
  const { accessToken } = await authService.login('user-42', 'passenger');
  const req = { headers: { authorization: `Bearer ${accessToken}` } };
  const { statusCode, nextCalled } = await runMiddlewareWith(authenticate, req);
  assert(nextCalled === true, 'next() should be called');
  assert(statusCode == null, `no error status expected, got ${statusCode}`);
  assert(req.user && req.user.userId === 'user-42', 'req.user.userId should be set');
  assert(req.user && req.user.role === 'passenger', 'req.user.role should be set');
  assert(req.user && req.user.id === 'user-42', 'req.user.id alias should be set');
  passed++;
});

test('missing Authorization header -> 401', async () => {
  const req = { headers: {} };
  const { statusCode, nextCalled } = await runMiddlewareWith(authenticate, req);
  assert(statusCode === 401, `expected 401, got ${statusCode}`);
  assert(nextCalled === false, 'next() should not be called');
  passed++;
});

test('tampered token -> 401', async () => {
  const { accessToken } = await authService.login('user-42', 'passenger');
  const tampered = accessToken.slice(0, -3) + 'abc';
  const req = { headers: { authorization: `Bearer ${tampered}` } };
  const { statusCode, nextCalled } = await runMiddlewareWith(authenticate, req);
  assert(statusCode === 401, `expected 401, got ${statusCode}`);
  assert(nextCalled === false, 'next() should not be called');
  passed++;
});

test('token signed with wrong algorithm (HS256) -> 401', async () => {
  const hs256Token = jwt.sign(
    { sub: 'user-42', role: 'passenger' },
    'safara-wrong-secret',
    { algorithm: 'HS256', expiresIn: 600 }
  );
  const req = { headers: { authorization: `Bearer ${hs256Token}` } };
  const { statusCode, nextCalled } = await runMiddlewareWith(authenticate, req);
  assert(statusCode === 401, `expected 401, got ${statusCode}`);
  assert(nextCalled === false, 'next() should not be called');
  passed++;
});

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
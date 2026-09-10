/**
 * Security Tests - JWT Algorithm Validation
 * Verifies RBAC middleware rejects HS256/default-secret tokens.
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../../presentation/middleware/rbac.middleware');

const PRIVATE_KEY = fs.readFileSync(path.resolve(__dirname, '../../../00-infrastructure/keys/jwt_private.pem'), 'utf8');

function mockReq(token) {
  return { headers: { authorization: token ? `Bearer ${token}` : undefined, cookie: undefined }, query: {}, body: {} };
}
function mockRes() {
  let code = 200, body = null;
  return { status(c) { code = c; return this; }, json(o) { body = o; return this; }, getCode: () => code };
}
function mockNext() { let called = false; return { call: () => { called = true; }, wasCalled: () => called }; }

describe('JWT Algorithm Security', () => {
  test('Valid RS256 token is accepted', () => {
    const token = jwt.sign({ userId: 'u1', role: 'admin' }, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
    const req = mockReq(token), res = mockRes(), next = mockNext();
    authenticate(req, res, next.call);
    expect(next.wasCalled()).toBe(true);
    expect(req.user.role).toBe('admin');
  });

  test('HS256 token with default secret is REJECTED', () => {
    const token = jwt.sign({ userId: 'u1', role: 'admin' }, 'safar_dev_secret', { algorithm: 'HS256', expiresIn: '1h' });
    const req = mockReq(token), res = mockRes(), next = mockNext();
    authenticate(req, res, next.call);
    expect(next.wasCalled()).toBe(false);
    expect(res.getCode()).toBe(401);
  });

  test('HS256 token with random secret is REJECTED', () => {
    const token = jwt.sign({ userId: 'u1', role: 'super_admin' }, 'random_secret', { algorithm: 'HS256', expiresIn: '1h' });
    const req = mockReq(token), res = mockRes(), next = mockNext();
    authenticate(req, res, next.call);
    expect(next.wasCalled()).toBe(false);
    expect(res.getCode()).toBe(401);
  });

  test('No token is REJECTED', () => {
    const req = mockReq(null), res = mockRes(), next = mockNext();
    authenticate(req, res, next.call);
    expect(next.wasCalled()).toBe(false);
    expect(res.getCode()).toBe(401);
  });

  test('Malformed token is REJECTED', () => {
    const req = mockReq('bad.token.here'), res = mockRes(), next = mockNext();
    authenticate(req, res, next.call);
    expect(next.wasCalled()).toBe(false);
    expect(res.getCode()).toBe(401);
  });
});

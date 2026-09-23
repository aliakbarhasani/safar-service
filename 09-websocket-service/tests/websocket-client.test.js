/**
 * websocket-client.test.js - P4-1 Validation Tests
 *
 * Validates the WebSocket service components without requiring socket.io-client.
 * Tests auth middleware, event bridge, and connection lifecycle.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// SECURITY (P0): توکن‌های تست فقط با RS256 و کلید خصوصی واقعی سرویس امضا می‌شوند.
// سکرت متقارن HS256 (`config.jwt.secret`) از سرویس حذف شده است.
const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '00-infrastructure', 'keys', 'jwt_private.pem'),
  'utf8'
);

function signRs256(payload) {
  return jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });
}

// ── Mock EventBus ──────────────────────────────────────────────────────────
class MockEventBus {
  constructor() { this.handlers = {}; }
  on(event, handler) { (this.handlers[event] = this.handlers[event] || []).push(handler); }
  off(event, handler) { this.handlers[event] = (this.handlers[event] || []).filter(h => h !== handler); }
  emit(event, data) { (this.handlers[event] || []).forEach(h => h(data)); }
}

// ── Mock Socket.io Server ──────────────────────────────────────────────────
class MockIo {
  constructor() { this.rooms = {}; this.handlers = {}; this.adapter = null; }
  to(room) { return { emit: (event, data) => { (this.rooms[room] = this.rooms[room] || []).push({ event, data }); } }; }
  on(event, handler) { this.handlers[event] = handler; }
  use(fn) { this._authMiddleware = fn; }
  adapter(a) { this.adapter = a; }
}

// ── Auth Middleware Tests ──────────────────────────────────────────────────
const authMiddleware = require('../middlewares/auth.middleware');

function makeSocket({ token = null, header = null } = {}) {
  return {
    handshake: {
      auth: token ? { token } : {},
      headers: header ? { authorization: header } : {},
    },
    join() {},
    user: null,
  };
}

describe('Auth Middleware', () => {
  test('accepts valid token from auth.token', () => {
    const token = signRs256({ userId: 'user-123', role: 'passenger' });
    const socket = makeSocket({ token });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.user.id).toBe('user-123');
    expect(socket.user.role).toBe('passenger');
  });

  test('accepts valid token from Authorization header', () => {
    const token = signRs256({ userId: 'user-456', role: 'driver' });
    const socket = makeSocket({ header: `Bearer ${token}` });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.user.id).toBe('user-456');
  });

  test('rejects HS256 token signed with a symmetric secret (no HS256 fallback)', () => {
    const hs256 = jwt.sign({ userId: 'user-999', role: 'admin' }, 'safar-service-jwt-secret-key-2026', {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    const socket = makeSocket({ token: hs256 });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('invalid') }));
    expect(socket.user).toBeNull();
  });

  test('rejects missing token', () => {
    const socket = makeSocket();
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('missing token') }));
  });

  test('rejects invalid token', () => {
    const socket = makeSocket({ token: 'invalid-token' });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('invalid') }));
  });

  test('rejects token without user identity', () => {
    const token = signRs256({ role: 'admin' });
    const socket = makeSocket({ token });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('no user identity') }));
  });
});

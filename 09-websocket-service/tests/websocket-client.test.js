/**
 * websocket-client.test.js - P4-1 Validation Tests
 *
 * Validates the WebSocket service components without requiring socket.io-client.
 * Tests auth middleware, event bridge, and connection lifecycle.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

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
    const token = jwt.sign({ userId: 'user-123', role: 'passenger' }, config.jwt.secret, { algorithm: 'HS256' });
    const socket = makeSocket({ token });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.user.id).toBe('user-123');
    expect(socket.user.role).toBe('passenger');
  });

  test('accepts valid token from Authorization header', () => {
    const token = jwt.sign({ userId: 'user-456', role: 'driver' }, config.jwt.secret, { algorithm: 'HS256' });
    const socket = makeSocket({ header: `Bearer ${token}` });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.user.id).toBe('user-456');
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
    const token = jwt.sign({ role: 'admin' }, config.jwt.secret, { algorithm: 'HS256' });
    const socket = makeSocket({ token });
    const next = jest.fn();
    authMiddleware(socket, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('no user identity') }));
  });
});

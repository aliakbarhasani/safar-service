/**
 * auth.middleware.js - JWT Authentication Middleware for Socket.io (P4-1)
 *
 * Verifies the bearer token presented at handshake time. On success,
 * populates socket.user and joins the socket to a per-user room so that
 * direct messages can be routed via io.to(userId).emit(...).
 *
 * Token sources (in order of precedence):
 *   1. socket.handshake.auth.token  (recommended by Socket.io v4)
 *   2. socket.handshake.headers.authorization
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Extract a bearer token from the handshake object.
 * @param {SocketHandshake} handshake
 * @returns {string|null}
 */
function extractToken(handshake) {
  const auth = handshake.auth || {};
  if (auth.token) return auth.token;

  const header = handshake.headers && handshake.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);

  return null;
}

/**
 * Verify a JWT and return the decoded payload (or null on failure).
 * @param {string} token
 * @returns {Object|null}
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
  } catch (_) {
    return null;
  }
}

/**
 * Socket.io middleware (io.use(...)).
 *
 * Calls next() on success, or next(Error) on failure — which causes
 * the client to receive a 'connect_error' event.
 */
function authMiddleware(socket, next) {
  const token = extractToken(socket.handshake);

  if (!token) {
    return next(new Error('Authentication error: missing token'));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Authentication error: invalid or expired token'));
  }

  // Normalise user identity (supports both {id} and {userId} payloads)
  socket.user = {
    id: decoded.userId || decoded.id || null,
    userId: decoded.userId || decoded.id || null,
    role: decoded.role || 'user',
  };

  if (!socket.user.id) {
    return next(new Error('Authentication error: token has no user identity'));
  }

  // Auto-join a per-user private room (for direct messaging)
  socket.join(socket.user.id);

  return next();
}

module.exports = authMiddleware;
module.exports.extractToken = extractToken;
module.exports.verifyToken = verifyToken;

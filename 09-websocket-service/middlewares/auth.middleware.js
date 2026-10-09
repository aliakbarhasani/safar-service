/**
 * auth.middleware.js - JWT Authentication Middleware for Socket.io (P4-1)
 *
 * Verifies the bearer token presented at handshake time. On success,
 * populates socket.user and joins the socket to a per-user room so that
 * direct messages can be routed via io.to(userId).emit(...).
 *
 * SECURITY (P0): فقط توکن‌های امضاشده با RS256 و کلید عمومی `jwt_public.pem`
 * پذیرفته می‌شوند. هیچ سکرت متقارن (HS256) یا الگوریتم دیگری پذیرفته نمی‌شود.
 *
 * Token sources (in order of precedence):
 *   1. socket.handshake.auth.token  (recommended by Socket.io v4)
 *   2. socket.handshake.headers.authorization
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

function extractToken(handshake) {
  const auth = handshake.auth || {};
  if (auth.token) return auth.token;
  const header = handshake.headers && handshake.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwt.publicKey, { algorithms: ['RS256'] });
    if (!decoded || decoded.type !== 'access') return null;
    return decoded;
  } catch (_) {
    return null;
  }
}

function authMiddleware(socket, next) {
  const token = extractToken(socket.handshake);
  if (!token) return next(new Error('Authentication error: missing token'));

  const decoded = verifyToken(token);
  if (!decoded) return next(new Error('Authentication error: invalid or expired access token'));

  // IAM tokens use the standard JWT "sub" claim; legacy tokens may use id/userId.
  socket.user = {
    id: decoded.userId || decoded.id || decoded.sub || null,
    userId: decoded.userId || decoded.id || decoded.sub || null,
    role: decoded.role || 'user',
  };

  if (!socket.user.id) return next(new Error('Authentication error: token has no user identity'));
  socket.join(socket.user.id);
  return next();
}

module.exports = authMiddleware;
module.exports.extractToken = extractToken;
module.exports.verifyToken = verifyToken;

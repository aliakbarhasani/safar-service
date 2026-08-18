/**
 * auth.middleware.js - JWT Authentication Middleware
 *
 * Verifies JWT tokens from Authorization header
 * and attaches decoded user info to req.user.
 */

const jwt = require('jsonwebtoken');
const config = require('../../../14-config-system/server.config');
const JwtService = require('../../domain/services/JwtService');

// یک نمونه مشترک؛ بدون کلید RSA در محیط‌های بدون keys بی‌اثر می‌ماند (lazy)
let _jwtService = null;
function getJwtService() {
  if (!_jwtService) {
    try {
      _jwtService = new JwtService();
    } catch {
      _jwtService = null;
    }
  }
  return _jwtService;
}

// Extract user from JWT token.
// دو الگوریتم پشتیبانی می‌شود:
//   1) RS256 (کانونی - JwtService) - سازگار با توکن‌های صادرشده از verify-otp/پروفایل
//   2) HS256 (backward-compat) - با config.jwt.secret
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      status_code: 401,
      message: 'No token provided. Please authenticate.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const jwtService = getJwtService();

    // ابتدا تلاش برای اعتبارسنجی RS256 (JwtService)
    if (jwtService) {
      try {
        const decoded = jwtService.verifyAccessToken(token);
        req.user = decoded;
        return next();
      } catch (rsErr) {
        // اگر RS256 نبود، به نسخه HS256 قدیمی fallback می‌کنیم
      }
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      status_code: 401,
      message: 'Invalid or expired token.',
    });
  }
}

// Simple RBAC authorization check
// Usage: authorize('admin', 'super_admin', 'support')
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        status_code: 401,
        message: 'User not authenticated.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        status_code: 403,
        message: 'Access denied. Insufficient permissions.',
      });
    }

    next();
  };
}

module.exports = { authenticate, authorize };
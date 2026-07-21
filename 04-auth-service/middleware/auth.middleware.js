/**
 * auth.middleware.js - میدلور امنیتی تایید توکن
 * 
 * طبق بند ۱۲ سند مادر: احراز هویت چندمرحله‌ای و کنترل دسترسی پویا
 * این میدلور توکن JWT را验证 کرده و اطلاعات کاربر را به request اضافه می‌کند
 */

const jwt = require('jsonwebtoken');
const config = require('../../14-config-system/server.config');

/**
 * تایید اصالت توکن JWT
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Access denied. Invalid token format' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * بررسی نقش کاربر (دسترسی پویا)
 * @param  {...string} roles - نقش‌های مجاز
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions' });
    }

    next();
  };
}

module.exports = {
  authenticate,
  authorize
};
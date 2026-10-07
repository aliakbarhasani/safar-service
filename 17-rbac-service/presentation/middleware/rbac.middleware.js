/**
 * rbac.middleware.js - Presentation Layer Middleware
 *
 * میان‌افزار مستقل و امن بررسی مجوز — قابل اعمال روی هر مسیر API:
 *
 *   const { authenticate, authorize } = require('17-rbac-service/presentation/middleware/rbac.middleware');
 *
 *   router.get('/users', authenticate, authorize('users.read'), handler);
 *
 * - authenticate:  توکن RS256 (Bearer یا کوکی HttpOnly) را verify و req.user را می‌سازد
 * - authorize(...): مجوز (permission slug) یا نقش‌ها را بررسی می‌کند
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { parseCookies } = require('../../../13-auth-management/infrastructure/helpers/cookieHelper');
const { Pool } = require('pg');
const PermissionRepository = require('../../infrastructure/repositories/PermissionRepository');
const UserRepository = require('../../infrastructure/repositories/UserRepository');
const AuthorizationService = require('../../domain/services/AuthorizationService');
const PermissionUseCases = require('../../application/use-cases/PermissionUseCases');

// --- بارگذاری یک‌باره کلید عمومی RS256 (منبع: 00-infrastructure/keys) ---
// SECURITY: No fallback to HS256 or default secret. RS256 with valid public key is mandatory.
let PUBLIC_KEY = null;
try {
  PUBLIC_KEY = fs.readFileSync(path.resolve(__dirname, '../../../00-infrastructure/keys/jwt_public.pem'), 'utf8');
} catch {
  console.error('[RBAC] FATAL: Could not load RSA public key (jwt_public.pem). Authentication will fail.');
}

// --- نمونه‌های اشتراکی (Dependency Injection - DIP) ---
const rbacPool = new Pool({
  host: process.env.PG_HOST || process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.PG_PORT || process.env.DB_PORT || 5432),
  database: process.env.PG_DATABASE || process.env.DB_NAME || 'safar_service',
  user: process.env.PG_USER || process.env.DB_USER || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : undefined),
});
const useCases = new PermissionUseCases({
  permissionRepository: new PermissionRepository(rbacPool),
  userRepository: new UserRepository(rbacPool),
  authorizationService: new AuthorizationService(),
});

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  const cookies = parseCookies(req.headers.cookie);
  return cookies.access_token || null;
}

/** احراز هویت: فقط Access Token معتبر → req.user */
function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, status_code: 401, message: 'No token provided.' });
  }
  if (!PUBLIC_KEY) {
    return res.status(500).json({ success: false, status_code: 500, message: 'Authentication service unavailable: public key not loaded.' });
  }
  try {
    const payload = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
    // SECURITY: RBAC endpoints must never accept a refresh/non-access token.
    // Legacy Auth Management access tokens are required to carry type=access.
    if (!payload || payload.type !== 'access') {
      return res.status(401).json({ success: false, status_code: 401, message: 'Invalid or unsupported token type.' });
    }
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ success: false, status_code: 401, message: 'Invalid or expired token.' });
  }
}

/**
 * مجوزدهی: هم permission slug (مثلاً 'users.read') و هم نقش (مثلاً 'admin') می‌پذیرد.
 * - اگر ورودی یک permission slug معتبر باشد → بررسی در role_permissions
 * - در غیر این‌صورت به‌عنوان نقش تفسیر می‌شود
 */
function authorize(...requirements) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, status_code: 401, message: 'Authentication required.' });
    }
    try {
      const userId = req.user.userId || req.user.id || req.user.sub || null;
      let effectiveRoles = req.user.role ? [req.user.role] : [];
      if (userId) {
        try {
          const dynamicRoles = await useCases.permissionRepository.getRolesForUser(userId);
          effectiveRoles = [...new Set([...effectiveRoles, ...dynamicRoles])];
        } catch { /* نبود DB → فقط نقش توکن */ }
      }
      const map = await useCases.getRolePermissionsMap();

      for (const req_ of requirements) {
        const isPermission = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(req_);
        if (isPermission) {
          const allowed = effectiveRoles.some((role) => (map[role] || []).includes(req_));
          if (allowed) return next();
        } else if (effectiveRoles.some((role) => useCases.authorizationService.isAdminRole(role) || role === req_)) {
          return next();
        }
      }
      return res.status(403).json({
        success: false,
        status_code: 403,
        message: 'Forbidden: insufficient permissions.',
        required: requirements,
      });
    } catch (e) {
      console.error('[RBAC] authorization check failed:', e.message);
      return res.status(500).json({ success: false, status_code: 500, message: 'Authorization check failed.' });
    }
  };
}

/** اعتبارسنجی ورودی سبک برای بدنه‌های JSON (بدون پکیج خارجی) */
function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
      const value = req.body ? req.body[field] : undefined;
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      if (value !== undefined && rule.type === 'string' && typeof value !== 'string') {
        errors.push(`${field} must be a string`);
      }
      if (value !== undefined && rule.pattern && !rule.pattern.test(String(value))) {
        errors.push(`${field} has invalid format`);
      }
    }
    if (errors.length) {
      return res.status(400).json({ success: false, status_code: 400, message: 'Validation failed', errors });
    }
    return next();
  };
}

module.exports = { authenticate, authorize, validateBody, useCases };

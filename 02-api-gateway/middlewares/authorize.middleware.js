'use strict';

/**
 * authorize.middleware.js - API Gateway (P11-2)
 *
 * میدلور مرتبه‌بالا (Higher-Order Middleware) برای اعمال RBAC/ABAC از طریق
 * موتور سیاست‌های IAM (PolicyEngine).
 *
 *   authorize(requiredPermission, resourceExtractorFn = null)
 *
 * - `req.user` (ست‌شده توسط `iamAuthenticate`) را به‌عنوان کاربر برمی‌گیرد.
 * - اگر `resourceExtractorFn` داده نشده باشد، فقط RBAC چک (مجوز).
 * - اگر داده شده باشد، منبع را async وریفای می‌کند و شروط ABAC مالکیت را اعمال.
 * - رد دسترسی → 403 Forbidden؛ نبود کاربر/توکن → 401 Unauthorized.
 */

const { PolicyEngine } = require('../../24-iam-service/domain/PolicyEngine');

const policyEngine = new PolicyEngine();

function authorize(requiredPermission, resourceExtractorFn = null) {
  if (!requiredPermission) {
    throw new Error('authorize middleware requires a permission string');
  }

  return async function authorizeMiddleware(req, res, next) {
    const user = req.user;

    // نبود کاربر (توکن احراز نشده/ناموفق) → 401
    if (!user || !user.id) {
      // SUPER_ADMIN role بدون id هنوز مجاز است (کاربر سیستمی)
      if (!(user && user.role === 'SUPER_ADMIN')) {
        return res.status(401).json({ success: false, error: 'Unauthorized: no authenticated user' });
      }
    }

    let resource = null;
    try {
      if (typeof resourceExtractorFn === 'function') {
        resource = await resourceExtractorFn(req, user);
      }
    } catch (extractErr) {
      // عدم یافتن منبع = عدم مجاور به آن
      return res.status(404).json({ success: false, error: extractErr.message || 'Resource not found' });
    }

    const decision = policyEngine.evaluate(user, requiredPermission, resource);

    if (!decision.allowed) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        reason: decision.reason,
      });
    }

    // منبع واکشده به req افزوده می‌شود (برای هندلرهای پایین‌دست)
    if (resource) req.resource = resource;
    return next();
  };
}

module.exports = { authorize, policyEngine };
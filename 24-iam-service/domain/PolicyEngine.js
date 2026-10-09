'use strict';

/**
 * PolicyEngine.js - IAM Service (P11-2)
 *
 * موتور ارزیابی سیاست‌های دسترسی (RBAC + ABAC).
 *
 * متد `evaluate(user, requiredPermission, resource = null)`:
 *   1) RBAC: اگر `user.permissions` (یا مجوزهای نقش) شامل `requiredPermission`
 *      نبود → رد (false / 403).
 *   2) ABAC: اگر مجوز وجود داشت و `resource` نیز پاس شده بود، قوانین مالکیت/شرط
 *      منبع را بررسی می‌کند.
 *
 * قوانین ABAC پیاده‌سازیشده:
 *   - `trip:read:own` / `trip:cancel:own` :
 *       قبول اگر `resource.passengerId === user.id` (مسافرِ مالکِ سفر) یا
 *             `resource.driverId === user.id` (راننده‌ی همان سفر) یا
 *             `user.role === 'SUPER_ADMIN'`.
 *   - `admin:config:write` / `admin:config:read` / `fleet:driver:read` :
 *       قبول برای CITY_ADMIN و FLEET_MANAGER و SUPER_ADMIN (بدون شرط مالکیت).
 *   - سایر مجوزها: بدون شرط ABAC (فقط RBAC).
 */

const { ROLES, permissionsForRole } = require('./roles');

// مجوزهایی با شرط مالکیت (Ownership) — هر کلید، تابعِ شرطِ ABAC برمی‌گرداند.
const OWNERSHIP_RULES = {
  'trip:read:own': (user, resource) =>
    resource &&
    (String(resource.passengerId) === String(user.id) ||
     String(resource.driverUserId || resource.driverId) === String(user.id)),
  'trip:cancel:own': (user, resource) =>
    resource &&
    (String(resource.passengerId) === String(user.id) ||
     String(resource.driverUserId || resource.driverId) === String(user.id)),
  'trip:create': () => true,
  'admin:config:read': (user) => user && user.role === ROLES.SUPER_ADMIN,
  'admin:config:write': (user) => user && (user.role === ROLES.CITY_ADMIN || user.role === ROLES.SUPER_ADMIN),
  'admin:audit:read': (user) => user && user.role === ROLES.SUPER_ADMIN,
  'fleet:driver:read': (user) => user && (user.role === ROLES.FLEET_MANAGER || user.role === ROLES.CITY_ADMIN || user.role === ROLES.SUPER_ADMIN),
  'fleet:driver:write': (user) => user && (user.role === ROLES.FLEET_MANAGER || user.role === ROLES.SUPER_ADMIN),
  'trip:read:any': (user) => user && (user.role === ROLES.FLEET_MANAGER || user.role === ROLES.CITY_ADMIN || user.role === ROLES.SUPER_ADMIN),
};

/**
 * استخراج مجوزهای مؤثر برای یک کاربر:
 *   - اگر `user.permissions` آرایه/مجموعه حاضر بود، از آن استفاده کن
 *   - وگرنه از مجوزهای نقش (ماتریس roles.js)
 */
function effectivePermissions(user) {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  if (user.permissions && typeof user.permissions === 'object') {
    try { return Array.from(user.permissions); } catch (_) { /* ignore */ }
  }
  return permissionsForRole(user.role);
}

class PolicyEngine {
  /**
   * ارزیابی دسترسی.
   * @param {Object} user                 - کاربر (req.user: { id, userId, role, permissions })
   * @param {string} requiredPermission   - مجوز موردنظر
   * @param {Object} [resource]           - منبع (برای قوانین ABAC)
   * @returns {{ allowed: boolean, reason?: string }}
   */
  evaluate(user, requiredPermission, resource = null) {
    if (!user || !requiredPermission) {
      return { allowed: false, reason: 'missing user or permission' };
    }

    // SUPER_ADMIN bypass سراسری
    if (user.role === ROLES.SUPER_ADMIN) {
      return { allowed: true, reason: 'super_admin_bypass' };
    }

    // 1) RBAC: آیا مجوز را دارد؟
    const permissions = effectivePermissions(user);
    const hasPermission = permissions.includes(requiredPermission);
    if (!hasPermission) {
      return { allowed: false, reason: `missing_permission:${requiredPermission}` };
    }

    // 2) ABAC: اگر شرطِ مالکیت/تخصصی برای این مجوز تعریف شده، چک کن.
    const rule = OWNERSHIP_RULES[requiredPermission];
    if (rule) {
      const abacAllowed = rule(user, resource);
      if (!abacAllowed) {
        return { allowed: false, reason: `abac_denied:${requiredPermission}:not_resource_owner` };
      }
    }

    return { allowed: true, reason: 'allowed' };
  }
}

module.exports = { PolicyEngine, effectivePermissions, OWNERSHIP_RULES };
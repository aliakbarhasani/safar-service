/**
 * AuthorizationService.js - Domain Service (منطق خالص نقش‌ها و مجوزها)
 *
 * اصول SOLID:
 *  - SRP: فقط منطق تصمیم‌گیری مجوز؛ هیچ دسترسی به دیتابیس/HTTP ندارد.
 *  - OCP: سلسله‌مراتب نقش‌ها و مجوزهای ویژه از پیکربندی تزریق می‌شوند.
 *  - DIP: Use-case ها به این سرویس (لایه دامنه) وابسته‌اند نه به Repository مستقیماً.
 */
const { Roles, ALL_ROLES, isValidRole } = require('../../../01-core-system/constants/Roles');

class AuthorizationService {
  constructor({ superAdminRole = Roles.SUPER_ADMIN, adminRole = Roles.ADMIN } = {}) {
    this.superAdminRole = superAdminRole;
    this.adminRole = adminRole;
  }

  /** آیا نقش معتبر است؟ (منبع حقیقت واحد: 01-core-system/constants/Roles.js) */
  isValidRole(role) {
    return isValidRole(role);
  }

  /** لیست نقش‌های معتبر سیستم */
  listRoles() {
    return [...ALL_ROLES];
  }

  /** آیا نقش داده‌شده مدیر سیستم است؟ */
  isAdminRole(role) {
    return role === this.superAdminRole || role === this.adminRole;
  }

  /**
   * تصمیم نهایی مجوز:
   *  - super_admin همیشه مجاز (bypass)
   *  - در غیر این‌صورت نقش باید مجوز خواسته‌شده را در فهرست مجوزهای خود داشته باشد
   */
  isAllowed({ role, permission, rolePermissions = [] }) {
    if (!this.isValidRole(role)) return false;
    if (role === this.superAdminRole) return true;
    if (!Permission_SlugValid(permission)) return false;
    return rolePermissions.includes(permission);
  }
}

function Permission_SlugValid(slug) {
  return typeof slug === 'string' && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(slug);
}

module.exports = AuthorizationService;

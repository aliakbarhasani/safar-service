'use strict';

/**
 * roles.js - IAM Service (P11-2)
 *
 * ماتریس نقش‌ها و مجوزها (RBAC base matrix).
 *
 * نقش‌ها:
 *   - PASSENGER    : مسافر — مدیریت سفرهای خود
 *   - DRIVER       : راننده — مدیریت سفرهای خود + محدودیت
 *   - FLEET_MANAGER: مدیر ناوگان — خواندن رانندگان/ناوگان
 *   - CITY_ADMIN   : ادمین شهری — مدیریت شهر/پیکربندی محلی
 *   - SUPER_ADMIN  : ادمین کل — همه مجوزها
 */

const ROLES = Object.freeze({
  PASSENGER: 'PASSENGER',
  DRIVER: 'DRIVER',
  FLEET_MANAGER: 'FLEET_MANAGER',
  CITY_ADMIN: 'CITY_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
});

// ---------------------------------------------------------------------------
// فهرست مجوزهای شناخته‌شده سیستم (برای اعتبارسنجی و استناد مستندات)
// ---------------------------------------------------------------------------
const PERMISSIONS = Object.freeze({
  // --- سفر ---
  'trip:create': 'trip:create',
  'trip:read:own': 'trip:read:own',
  'trip:cancel:own': 'trip:cancel:own',
  'trip:read:any': 'trip:read:any',

  // --- تنظیمات / ادمین ---
  'admin:config:read': 'admin:config:read',
  'admin:config:write': 'admin:config:write',
  'fleet:driver:read': 'fleet:driver:read',
  'fleet:driver:write': 'fleet:driver:write',

  // --- مکان‌یابی ---
  'driver:location:update': 'driver:location:update',

  // --- عمومی رزرو (برای مانیتورینگ) ---
  'admin:audit:read': 'admin:audit:read',
});

// ---------------------------------------------------------------------------
// نگاشت هر نقش به مجوزهای پایه
// ---------------------------------------------------------------------------
const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.PASSENGER]: Object.freeze([
    PERMISSIONS['trip:create'],
    PERMISSIONS['trip:read:own'],
    PERMISSIONS['trip:cancel:own'],
  ]),
  [ROLES.DRIVER]: Object.freeze([
    PERMISSIONS['trip:read:own'],
    PERMISSIONS['trip:cancel:own'],
    PERMISSIONS['driver:location:update'],
  ]),
  [ROLES.FLEET_MANAGER]: Object.freeze([
    PERMISSIONS['trip:read:any'],
    PERMISSIONS['fleet:driver:read'],
    PERMISSIONS['fleet:driver:write'],
  ]),
  [ROLES.CITY_ADMIN]: Object.freeze([
    PERMISSIONS['trip:read:any'],
    PERMISSIONS['admin:config:read'],
    PERMISSIONS['admin:config:write'],
    PERMISSIONS['fleet:driver:read'],
  ]),
  [ROLES.SUPER_ADMIN]: Object.freeze([
    PERMISSIONS['trip:create'],
    PERMISSIONS['trip:read:any'],
    PERMISSIONS['trip:read:own'],
    PERMISSIONS['trip:cancel:own'],
    PERMISSIONS['admin:config:read'],
    PERMISSIONS['admin:config:write'],
    PERMISSIONS['fleet:driver:read'],
    PERMISSIONS['fleet:driver:write'],
    PERMISSIONS['admin:audit:read'],
  ]),
});

/**
 * بازگرداندن مجوزهای یک نقش (بازگشت آرایه جدید برای جلوگیری از تغییر).
 * @param {string} role
 * @returns {string[]}
 */
function permissionsForRole(role) {
  const normalized = role ? role.toUpperCase() : '';
  const perms = ROLE_PERMISSIONS[normalized];
  return perms ? Array.from(perms) : [];
}

/**
 * آیا نقشِ داده‌شده مجوزِ موردنظر را دارد؟
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
function roleHasPermission(role, permission) {
  return permissionsForRole(role).includes(permission);
}

module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole, roleHasPermission };
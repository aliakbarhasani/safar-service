/**
 * PermissionUseCases.js - Application Layer
 *
 * Use Case های RBAC. ورودی/خروجی اشیاء ساده (DTO) است؛
 * منطق تصمیم در AuthorizationService (دامنه) و دسترسی داده در Repository ها (زیرساخت).
 *
 * SOLID:
 *  - SRP: هر Use Case یک عملیات
 *  - DIP: وابستگی‌ها (Repository/Service) از بیرون تزریق می‌شوند
 */
const Permission = require('../../domain/entities/Permission');

class PermissionUseCases {
  constructor({ permissionRepository, authorizationService, cache = { map: null, fetchedAt: 0 }, cacheTtlMs = 30000 }) {
    this.permissionRepository = permissionRepository;
    this.authorizationService = authorizationService;
    this._cache = cache;               // کش در حافظه با TTL برای عملکرد middleware
    this._cacheTtlMs = cacheTtlMs;
  }

  _isCacheFresh() {
    return this._cache.map !== null && Date.now() - this._cache.fetchedAt < this._cacheTtlMs;
  }

  _invalidateCache() {
    this._cache.map = null;
    this._cache.fetchedAt = 0;
  }

  async getRolePermissionsMap() {
    if (!this._isCacheFresh()) {
      this._cache.map = await this.permissionRepository.getRolePermissionsMap();
      this._cache.fetchedAt = Date.now();
    }
    return this._cache.map;
  }

  async listPermissions() {
    return this.permissionRepository.findAll();
  }

  async createPermission({ slug, description, moduleName }) {
    if (!Permission.isValidSlug(slug)) {
      const err = new Error('Invalid permission slug. Expected format: module.action (e.g. users.read)');
      err.status = 400;
      throw err;
    }
    if (!moduleName || typeof moduleName !== 'string') {
      const err = new Error('moduleName is required');
      err.status = 400;
      throw err;
    }
    const created = await this.permissionRepository.create({ slug, description, moduleName });
    this._invalidateCache();
    return created;
  }

  async deletePermission(slug) {
    const removed = await this.permissionRepository.remove(slug);
    this._invalidateCache();
    return removed;
  }

  async assignPermission({ roleName, slug }) {
    if (!this.authorizationService.isValidRole(roleName)) {
      const err = new Error(`Unknown role: ${roleName}`);
      err.status = 400;
      throw err;
    }
    const result = await this.permissionRepository.assignPermissionToRole(roleName, slug);
    this._invalidateCache();
    return result;
  }

  async revokePermission({ roleName, slug }) {
    const result = await this.permissionRepository.revokePermissionFromRole(roleName, slug);
    this._invalidateCache();
    return result;
  }

  async listRoles() {
    return this.authorizationService.listRoles();
  }

  /**
   * تصمیم مجوز: نقش کاربر + مجوز خواسته‌شده
   * نقش از توکن (req.user.role) می‌آید؛ در نبود آن از DB fallback می‌شود.
   */
  async hasPermission({ userId, role, permission }) {
    let effectiveRole = role;
    if (!effectiveRole && userId) {
      effectiveRole = await this.permissionRepository.getRoleById(userId);
    }
    const map = await this.getRolePermissionsMap();
    return this.authorizationService.isAllowed({
      role: effectiveRole,
      permission,
      rolePermissions: map[effectiveRole] || [],
    });
  }
}

module.exports = PermissionUseCases;

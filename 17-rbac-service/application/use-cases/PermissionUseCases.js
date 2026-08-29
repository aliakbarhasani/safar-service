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
  constructor({ permissionRepository, authorizationService, auditRepository = null, cache = { map: null, fetchedAt: 0 }, cacheTtlMs = 30000 }) {
    this.permissionRepository = permissionRepository;
    this.authorizationService = authorizationService;
    this.auditRepository = auditRepository;
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

  /** ابطال آنی کش (قابل فراخوانی از بیرون — پس از هر تغییر نقش/مجوز) */
  invalidateCache() {
    this._invalidateCache();
  }

  /** ثبت رویداد امنیتی در audit_logs (fail-open) */
  async _audit({ eventType, entityType, entityId, actorId, metadata }) {
    if (!this.auditRepository) return false;
    return this.auditRepository.record({ eventType, entityType, entityId, actorId, metadata });
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

  async createPermission({ slug, description, moduleName, actorId = null }) {
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
    await this._audit({
      eventType: 'rbac.permission.created',
      entityType: 'permission',
      entityId: created.id,
      actorId,
      metadata: { slug, moduleName },
    });
    return created;
  }

  async deletePermission(slug, actorId = null) {
    const removed = await this.permissionRepository.remove(slug);
    this._invalidateCache();
    if (removed) {
      await this._audit({
        eventType: 'rbac.permission.deleted',
        entityType: 'permission',
        entityId: null,
        actorId,
        metadata: { slug },
      });
    }
    return removed;
  }

  async assignPermission({ roleName, slug, actorId = null }) {
    if (!this.authorizationService.isValidRole(roleName)) {
      const err = new Error(`Unknown role: ${roleName}`);
      err.status = 400;
      throw err;
    }
    const result = await this.permissionRepository.assignPermissionToRole(roleName, slug);
    this._invalidateCache();
    await this._audit({
      eventType: 'rbac.permission.assigned',
      entityType: 'role',
      entityId: null,
      actorId,
      metadata: { roleName, slug },
    });
    return result;
  }

  async revokePermission({ roleName, slug, actorId = null }) {
    const result = await this.permissionRepository.revokePermissionFromRole(roleName, slug);
    this._invalidateCache();
    if (result) {
      await this._audit({
        eventType: 'rbac.permission.revoked',
        entityType: 'role',
        entityId: null,
        actorId,
        metadata: { roleName, slug },
      });
    }
    return result;
  }

  async listRoles() {
    return this.authorizationService.listRoles();
  }

  // ── انتساب نقش به کاربر (user_roles) ─────────────────────────────

  /** نقش‌های یک کاربر */
  async getUserRoles(userId) {
    if (!userId || typeof userId !== 'string') {
      const err = new Error('userId is required');
      err.status = 400;
      throw err;
    }
    return this.permissionRepository.getRolesForUser(userId);
  }

  /** انتساب نقش به کاربر (فقط نقش‌های معتبر؛ idempotent) */
  async assignRoleToUser({ userId, roleName, assignedBy = null }) {
    if (!userId || typeof userId !== 'string') {
      const err = new Error('userId is required');
      err.status = 400;
      throw err;
    }
    if (!this.authorizationService.isValidRole(roleName)) {
      const err = new Error(`Unknown role: ${roleName}`);
      err.status = 400;
      throw err;
    }
    // جلوگیری از خود‌ارتقایی: ادمین نمی‌تواند به خودش نقش بدهد
    if (assignedBy && assignedBy === userId) {
      const err = new Error('Self role-assignment is not allowed.');
      err.status = 403;
      throw err;
    }
    const assigned = await this.permissionRepository.assignRoleToUser({ userId, roleName, assignedBy });
    this.invalidateCache();
    await this._audit({
      eventType: 'rbac.user_role.assigned',
      entityType: 'user',
      entityId: userId,
      actorId: assignedBy,
      metadata: { roleName, assigned },
    });
    return { userId, roleName, assigned };
  }

  /** سلب نقش از کاربر */
  async revokeRoleFromUser({ userId, roleName, actorId = null }) {
    if (!userId || typeof userId !== 'string') {
      const err = new Error('userId is required');
      err.status = 400;
      throw err;
    }
    if (!this.authorizationService.isValidRole(roleName)) {
      const err = new Error(`Unknown role: ${roleName}`);
      err.status = 400;
      throw err;
    }
    const revoked = await this.permissionRepository.revokeRoleFromUser({ userId, roleName });
    this.invalidateCache();
    if (revoked) {
      await this._audit({
        eventType: 'rbac.user_role.revoked',
        entityType: 'user',
        entityId: userId,
        actorId,
        metadata: { roleName, revoked },
      });
    }
    return { userId, roleName, revoked };
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

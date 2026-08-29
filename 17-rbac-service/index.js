/**
 * index.js - نقطه ورود ماژول RBAC
 *
 * استفاده در API Gateway (02-api-gateway):
 *   const { createRbacRouter, rbacMiddleware } = require('../17-rbac-service');
 *   app.use('/api/v1/rbac', createRbacRouter());
 *   // و برای محافظت از هر مسیر دیگر:
 *   router.get('/admin/stats', rbacMiddleware.authenticate, rbacMiddleware.authorize('reports.read'), handler);
 *
 * Seed پیش‌فرض: اگر DB خالی باشد، مجوزهای پایه + نگاشت نقش admin ساخته می‌شود.
 */
const { Pool } = require('pg');
const PermissionRepository = require('./infrastructure/repositories/PermissionRepository');
const UserRepository = require('./infrastructure/repositories/UserRepository');
const AuditRepository = require('./infrastructure/repositories/AuditRepository');
const AuthorizationService = require('./domain/services/AuthorizationService');
const PermissionUseCases = require('./application/use-cases/PermissionUseCases');
const createRbacRouter = require('./presentation/routes/RbacRouter');
const rbacMiddleware = require('./presentation/middleware/rbac.middleware');

/** مجوزهای پایه سیستم (seed) */
const DEFAULT_PERMISSIONS = [
  { slug: 'users.read', moduleName: 'users', description: 'مشاهده لیست و جزئیات کاربران' },
  { slug: 'users.update', moduleName: 'users', description: 'ویرایش کاربران' },
  { slug: 'users.delete', moduleName: 'users', description: 'حذف کاربران' },
  { slug: 'rbac.manage', moduleName: 'rbac', description: 'مدیریت نقش‌ها و مجوزها' },
  { slug: 'reports.read', moduleName: 'reports', description: 'مشاهده گزارش‌ها' },
  { slug: 'trips.read', moduleName: 'mobility', description: 'مشاهده سفرها' },
  { slug: 'wallet.read', moduleName: 'wallet', description: 'مشاهده تراکنش‌های کیف پول' },
];

class RbacModule {
  constructor({ pool } = {}) {
    this.pool = pool || new Pool();
    this.authorizationService = new AuthorizationService();
    this.permissionRepository = new PermissionRepository(this.pool);
    this.userRepository = new UserRepository(this.pool);
    this.auditRepository = new AuditRepository(this.pool);
    this.useCases = new PermissionUseCases({
      permissionRepository: this.permissionRepository,
      userRepository: this.userRepository,
      authorizationService: this.authorizationService,
      auditRepository: this.auditRepository,
    });
  }

  /** seed مجوزهای پایه + نگاشت به نقش admin (idempotent) */
  async seed() {
    for (const p of DEFAULT_PERMISSIONS) {
      await this.permissionRepository.create(p);
    }
    for (const p of DEFAULT_PERMISSIONS) {
      await this.permissionRepository.assignPermissionToRole('admin', p.slug);
    }
    return DEFAULT_PERMISSIONS.map((p) => p.slug);
  }

  router() {
    return createRbacRouter({ useCases: this.useCases });
  }
}

module.exports = {
  RbacModule,
  createRbacRouter,
  rbacMiddleware,
  PermissionUseCases,
  AuthorizationService,
  PermissionRepository,
  AuditRepository,
};

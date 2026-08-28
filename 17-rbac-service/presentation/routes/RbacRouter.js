/**
 * RbacRouter.js - Presentation Layer (Express Router)
 *
 * مسیرها (همه admin محافظت‌شده):
 *   GET    /api/v1/rbac/permissions
 *   POST   /api/v1/rbac/permissions            { slug, description, moduleName }
 *   DELETE /api/v1/rbac/permissions/:slug
 *   GET    /api/v1/rbac/roles                  (نقش‌ها + مجوزهای هر نقش)
 *   PUT    /api/v1/rbac/roles/:role/permissions   { slug }
 *   DELETE /api/v1/rbac/roles/:role/permissions/:slug
 */
const express = require('express');
const RbacController = require('../controllers/RbacController');
const { authenticate, authorize, validateBody } = require('../middleware/rbac.middleware');

function createRbacRouter({ useCases }) {
  const router = express.Router();
  const controller = new RbacController({ useCases });

  router.use(authenticate);                       // 1) احراز هویت
  router.use(authorize('rbac.manage', 'admin', 'super_admin')); // 2) مجوزدهی

  const slugRule = { slug: { required: true, type: 'string', pattern: /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/ } };

  router.get('/permissions', controller.listPermissions.bind(controller));
  router.post('/permissions', validateBody({ ...slugRule, moduleName: { required: true, type: 'string' } }), controller.createPermission.bind(controller));
  router.delete('/permissions/:slug', controller.deletePermission.bind(controller));

  router.get('/roles', controller.listRoles.bind(controller));
  router.put('/roles/:role/permissions', validateBody(slugRule), controller.assignPermission.bind(controller));
  router.delete('/roles/:role/permissions/:slug', controller.revokePermission.bind(controller));

  // انتساب نقش به کاربر (user_roles)
  router.get('/users/:userId/roles', controller.getUserRoles.bind(controller));
  router.put('/users/:userId/roles', validateBody({ roleName: { required: true, type: 'string' } }), controller.assignUserRole.bind(controller));
  router.delete('/users/:userId/roles/:roleName', controller.revokeUserRole.bind(controller));

  return router;
}

module.exports = createRbacRouter;

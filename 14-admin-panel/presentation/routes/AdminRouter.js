const express = require('express');
const AdminController = require('../controllers/AdminController');
const router = express.Router();
const ctrl = new AdminController();
const { authenticate, authorize } = require('../../../17-rbac-service/presentation/middleware/rbac.middleware');

// ── Health & Root ─────────────────────────────────────────────────
router.get('/health', (req, res) => ctrl.getHealth(req, res));
router.get('/', (req, res) => ctrl.getRoot(req, res));

// ── Dashboard ─────────────────────────────────────────────────────
// SECURITY: all administrative data/actions require an authenticated admin.
router.use(['/dashboard', '/users', '/users/:id', '/trips', '/trips/:id'], authenticate, authorize('admin', 'super_admin'));
router.get('/dashboard', (req, res, next) => ctrl.getDashboard(req, res, next));

// ── User Management ───────────────────────────────────────────────
router.get('/users', (req, res, next) => ctrl.listUsers(req, res, next));
router.get('/users/:id', (req, res, next) => ctrl.getUser(req, res, next));
router.put('/users/:id/block', (req, res, next) => ctrl.blockUser(req, res, next));
router.put('/users/:id/unblock', (req, res, next) => ctrl.unblockUser(req, res, next));

// ── Trip Management ───────────────────────────────────────────────
router.get('/trips', (req, res, next) => ctrl.listTrips(req, res, next));
router.get('/trips/:id', (req, res, next) => ctrl.getTrip(req, res, next));
router.put('/trips/:id/cancel', (req, res, next) => ctrl.cancelTrip(req, res, next));

// ── RBAC Management (نقش‌ها و دسترسی‌ها) ──────────────────────────
// محافظت‌شده: احراز هویت در سطح پنل + توکن ادمین به Gateway فوروارد می‌شود
// تا authorize سطح Gateway (rbac.manage / admin / super_admin) اعمال شود.
router.use(['/rbac', '/users/:id/roles'], authenticate, authorize('admin', 'super_admin'));
router.get('/rbac/permissions', (req, res, next) => ctrl.listRbacPermissions(req, res, next));
router.get('/rbac/roles', (req, res, next) => ctrl.listRbacRoles(req, res, next));
router.get('/users/:id/roles', (req, res, next) => ctrl.getUserRoles(req, res, next));
router.put('/users/:id/roles', (req, res, next) => ctrl.assignUserRole(req, res, next));
router.delete('/users/:id/roles/:roleName', (req, res, next) => ctrl.revokeUserRole(req, res, next));

module.exports = router;
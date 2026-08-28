const AdminUseCases = require('../../application');

/**
 * Admin Panel Controller
 * Handles dashboard, user management, and trip management.
 * All business logic delegates to AdminUseCases (application layer).
 */
class AdminController {
  constructor() {
    this.useCases = new AdminUseCases();
  }

  // ── Health & Dashboard ──────────────────────────────────────────
  getHealth(req, res) {
    return res.status(200).json({
      success: true,
      status_code: 200,
      module: 'admin-panel',
      version: '1.0.0',
      message: 'Admin Panel API is operational',
      timestamp: new Date().toISOString(),
    });
  }

  getRoot(req, res) {
    return res.status(200).json({
      success: true,
      status_code: 200,
      module: 'admin-panel',
      message: 'Safar Service Admin Panel',
      available_endpoints: [
        { path: '/health', method: 'GET', description: 'Health check' },
        { path: '/api/v1/admin/health', method: 'GET', description: 'API health check' },
        { path: '/api/v1/admin/dashboard', method: 'GET', description: 'System dashboard overview' },
        { path: '/api/v1/admin/users', method: 'GET', description: 'List all users' },
        { path: '/api/v1/admin/users/:id', method: 'GET', description: 'Get user by ID' },
        { path: '/api/v1/admin/users/:id/block', method: 'PUT', description: 'Block a user' },
        { path: '/api/v1/admin/users/:id/unblock', method: 'PUT', description: 'Unblock a user' },
        { path: '/api/v1/admin/trips', method: 'GET', description: 'List all trips' },
        { path: '/api/v1/admin/trips/:id', method: 'GET', description: 'Get trip by ID' },
        { path: '/api/v1/admin/trips/:id/cancel', method: 'PUT', description: 'Cancel a trip' },
      ],
    });
  }

  async getDashboard(req, res, next) {
    try {
      const health = await this.useCases.getSystemHealth();
      return res.status(200).json({
        success: true,
        status_code: 200,
        data: health,
      });
    } catch (err) {
      next(err);
    }
  }

  // ── User Management ─────────────────────────────────────────────
  async listUsers(req, res, next) {
    try {
      const { role, status, page, limit } = req.query;
      const filters = {};
      if (role) filters.role = role;
      if (status) filters.status = status;
      if (page) filters.page = page;
      if (limit) filters.limit = limit;
      const data = await this.useCases.listUsers(filters);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async getUser(req, res, next) {
    try {
      const { id } = req.params;
      const data = await this.useCases.getUser(id);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async blockUser(req, res, next) {
    try {
      const { id } = req.params;
      const data = await this.useCases.blockUser(id);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async unblockUser(req, res, next) {
    try {
      const { id } = req.params;
      const data = await this.useCases.unblockUser(id);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  // ── Trip Management ─────────────────────────────────────────────
  async listTrips(req, res, next) {
    try {
      const { status, driver_id, page, limit } = req.query;
      const filters = {};
      if (status) filters.status = status;
      if (driver_id) filters.driver_id = driver_id;
      if (page) filters.page = page;
      if (limit) filters.limit = limit;
      const data = await this.useCases.listTrips(filters);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async getTrip(req, res, next) {
    try {
      const { id } = req.params;
      const data = await this.useCases.getTrip(id);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async cancelTrip(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const data = await this.useCases.cancelTrip(id, reason || 'Cancelled by admin');
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  // ── RBAC Management (admin roles & user role assignment) ────────
  async listRbacPermissions(req, res, next) {
    try {
      const data = await this.useCases.listRbacPermissions(req);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async listRbacRoles(req, res, next) {
    try {
      const data = await this.useCases.listRbacRoles(req);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async getUserRoles(req, res, next) {
    try {
      const data = await this.useCases.getUserRoles(req, req.params.id);
      return res.status(200).json({ success: true, status_code: 200, data });
    } catch (err) {
      next(err);
    }
  }

  async assignUserRole(req, res, next) {
    try {
      const { roleName } = req.body || {};
      const { status, data } = await this.useCases.assignUserRole(req, req.params.id, roleName);
      return res.status(status).json({ success: true, status_code: status, data });
    } catch (err) {
      next(err);
    }
  }

  async revokeUserRole(req, res, next) {
    try {
      const { status, data } = await this.useCases.revokeUserRole(req, req.params.id, req.params.roleName);
      return res.status(status).json({ success: true, status_code: status, data });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AdminController;
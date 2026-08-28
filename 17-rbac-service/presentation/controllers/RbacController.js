/**
 * RbacController.js - Presentation Layer
 *
 * REST endpoints مدیریت مجوزها و نقش‌ها (admin-only).
 */
class RbacController {
  constructor({ useCases }) {
    this.useCases = useCases;
  }

  /** GET /api/v1/rbac/permissions */
  async listPermissions(req, res) {
    try {
      const perms = await this.useCases.listPermissions();
      return res.status(200).json({ success: true, status_code: 200, data: { permissions: perms.map((p) => p.toJSON()) } });
    } catch (e) {
      return res.status(500).json({ success: false, status_code: 500, message: 'Failed to list permissions.' });
    }
  }

  /** POST /api/v1/rbac/permissions */
  async createPermission(req, res) {
    try {
      const { slug, description, moduleName } = req.body;
      const created = await this.useCases.createPermission({ slug, description, moduleName });
      return res.status(201).json({ success: true, status_code: 201, data: { permission: created.toJSON() } });
    } catch (e) {
      return res.status(e.status || 500).json({ success: false, status_code: e.status || 500, message: e.message });
    }
  }

  /** DELETE /api/v1/rbac/permissions/:slug */
  async deletePermission(req, res) {
    try {
      const removed = await this.useCases.deletePermission(req.params.slug);
      if (!removed) return res.status(404).json({ success: false, status_code: 404, message: 'Permission not found.' });
      return res.status(200).json({ success: true, status_code: 200, message: 'Permission deleted.' });
    } catch (e) {
      return res.status(500).json({ success: false, status_code: 500, message: 'Failed to delete permission.' });
    }
  }

  /** GET /api/v1/rbac/roles */
  async listRoles(req, res) {
    try {
      const roles = await this.useCases.listRoles();
      const map = await this.useCases.getRolePermissionsMap();
      return res.status(200).json({
        success: true, status_code: 200,
        data: { roles: roles.map((r) => ({ name: r, permissions: map[r] || [] })) },
      });
    } catch (e) {
      return res.status(500).json({ success: false, status_code: 500, message: 'Failed to list roles.' });
    }
  }

  /** PUT /api/v1/rbac/roles/:role/permissions */
  async assignPermission(req, res) {
    try {
      const { role } = req.params;
      const { slug } = req.body;
      await this.useCases.assignPermission({ roleName: role, slug });
      return res.status(200).json({ success: true, status_code: 200, message: `Permission '${slug}' assigned to '${role}'.` });
    } catch (e) {
      return res.status(e.status || 500).json({ success: false, status_code: e.status || 500, message: e.message });
    }
  }

  /** DELETE /api/v1/rbac/roles/:role/permissions/:slug */
  async revokePermission(req, res) {
    try {
      const { role, slug } = req.params;
      const revoked = await this.useCases.revokePermission({ roleName: role, slug });
      if (!revoked) return res.status(404).json({ success: false, status_code: 404, message: 'Mapping not found.' });
      return res.status(200).json({ success: true, status_code: 200, message: `Permission '${slug}' revoked from '${role}'.` });
    } catch (e) {
      return res.status(e.status || 500).json({ success: false, status_code: e.status || 500, message: e.message });
    }
  }

  // ── انتساب نقش به کاربر (user_roles) ─────────────────────────────

  /** GET /api/v1/rbac/users/:userId/roles */
  async getUserRoles(req, res) {
    try {
      const roles = await this.useCases.getUserRoles(req.params.userId);
      return res.status(200).json({ success: true, status_code: 200, data: { userId: req.params.userId, roles } });
    } catch (e) {
      return res.status(e.status || 500).json({ success: false, status_code: e.status || 500, message: e.message });
    }
  }

  /** PUT /api/v1/rbac/users/:userId/roles  { roleName } */
  async assignUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { roleName } = req.body || {};
      const assignedBy = (req.user && req.user.userId) || req.user?.sub || null;
      const result = await this.useCases.assignRoleToUser({ userId, roleName, assignedBy });
      return res.status(result.assigned ? 201 : 200).json({
        success: true,
        status_code: result.assigned ? 201 : 200,
        message: result.assigned
          ? `Role '${roleName}' assigned to user.`
          : `User already has role '${roleName}'.`,
        data: result,
      });
    } catch (e) {
      return res.status(e.status || 500).json({ success: false, status_code: e.status || 500, message: e.message });
    }
  }

  /** DELETE /api/v1/rbac/users/:userId/roles/:roleName */
  async revokeUserRole(req, res) {
    try {
      const { userId, roleName } = req.params;
      const result = await this.useCases.revokeRoleFromUser({ userId, roleName });
      if (!result.revoked) {
        return res.status(404).json({ success: false, status_code: 404, message: 'User does not have this role.' });
      }
      return res.status(200).json({ success: true, status_code: 200, message: `Role '${roleName}' revoked from user.`, data: result });
    } catch (e) {
      return res.status(e.status || 500).json({ success: false, status_code: e.status || 500, message: e.message });
    }
  }
}

module.exports = RbacController;

const { AuthServiceClient, TripServiceClient, RbacServiceClient } = require('../infrastructure');

/**
 * Admin use-cases — orchestrates business logic for the admin panel.
 * All external communication goes through infrastructure clients (HTTP),
 * keeping this layer decoupled from other modules.
 */
class AdminUseCases {
  constructor() {
    this.authClient = new AuthServiceClient();
    this.tripClient = new TripServiceClient();
    this.rbacClient = new RbacServiceClient();
  }

  // ── Dashboard / Health ──────────────────────────────────────────
  async getSystemHealth() {
    const [authHealth, tripHealth] = await Promise.allSettled([
      this.authClient.health(),
      this.tripClient.health(),
    ]);
    return {
      admin_panel: { status: 'healthy', uptime: process.uptime() },
      auth_service: authHealth.status === 'fulfilled'
        ? { status: 'reachable', data: authHealth.value.data }
        : { status: 'unreachable', error: authHealth.reason?.message },
      trip_service: tripHealth.status === 'fulfilled'
        ? { status: 'reachable', data: tripHealth.value.data }
        : { status: 'unreachable', error: tripHealth.reason?.message },
    };
  }

  // ── User Management ─────────────────────────────────────────────
  async listUsers(filters = {}) {
    const result = await this.authClient.listUsers(filters);
    return result.data;
  }

  async getUser(userId) {
    const result = await this.authClient.getUser(userId);
    return result.data;
  }

  async blockUser(userId) {
    const result = await this.authClient.blockUser(userId);
    return result.data;
  }

  async unblockUser(userId) {
    const result = await this.authClient.unblockUser(userId);
    return result.data;
  }

  // ── Trip Management ─────────────────────────────────────────────
  async listTrips(filters = {}) {
    const result = await this.tripClient.listTrips(filters);
    return result.data;
  }

  async getTrip(tripId) {
    const result = await this.tripClient.getTrip(tripId);
    return result.data;
  }

  async cancelTrip(tripId, reason) {
    const result = await this.tripClient.cancelTrip(tripId, reason);
    return result.data;
  }

  // ── RBAC Management (via API Gateway) ───────────────────────────
  _rbacToken(req) {
    const h = req.headers.authorization;
    return h && h.startsWith('Bearer ') ? h.slice(7) : null;
  }

  async listRbacPermissions(req) {
    const result = await this.rbacClient.withToken(this._rbacToken(req)).listPermissions();
    return result.data;
  }

  async listRbacRoles(req) {
    const result = await this.rbacClient.withToken(this._rbacToken(req)).listRoles();
    return result.data;
  }

  async getUserRoles(req, userId) {
    const result = await this.rbacClient.withToken(this._rbacToken(req)).getUserRoles(userId);
    return result.data;
  }

  async assignUserRole(req, userId, roleName) {
    const result = await this.rbacClient.withToken(this._rbacToken(req)).assignUserRole(userId, roleName);
    return { status: result.status, data: result.data };
  }

  async revokeUserRole(req, userId, roleName) {
    const result = await this.rbacClient.withToken(this._rbacToken(req)).revokeUserRole(userId, roleName);
    return { status: result.status, data: result.data };
  }
}

module.exports = AdminUseCases;
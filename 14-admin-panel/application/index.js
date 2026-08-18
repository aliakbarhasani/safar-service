const { AuthServiceClient, TripServiceClient } = require('../infrastructure');

/**
 * Admin use-cases — orchestrates business logic for the admin panel.
 * All external communication goes through infrastructure clients (HTTP),
 * keeping this layer decoupled from other modules.
 */
class AdminUseCases {
  constructor() {
    this.authClient = new AuthServiceClient();
    this.tripClient = new TripServiceClient();
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
}

module.exports = AdminUseCases;
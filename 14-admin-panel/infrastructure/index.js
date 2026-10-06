const http = require('http');

/**
 * Internal HTTP client to communicate with other Safar microservices.
 * This ensures the admin-panel remains decoupled — interacting with
 * Auth, Trip, and other modules exclusively via HTTP (not direct code imports).
 */
class AuthServiceClient {
  constructor(baseUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      });
      req.on('error', (err) => reject(err));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async listUsers(query = {}) {
    const qs = new URLSearchParams(query).toString();
    return this._request('GET', `/api/v1/auth/users${qs ? '?' + qs : ''}`);
  }

  async getUser(userId) {
    return this._request('GET', `/api/v1/auth/users/${userId}`);
  }

  async blockUser(userId) {
    return this._request('PUT', `/api/v1/auth/users/${userId}/block`);
  }

  async unblockUser(userId) {
    return this._request('PUT', `/api/v1/auth/users/${userId}/unblock`);
  }

  async health() {
    return this._request('GET', '/health');
  }
}

class TripServiceClient {
  constructor(baseUrl = process.env.TRIP_SERVICE_URL || 'http://localhost:3004') {
    this.baseUrl = baseUrl;
  }

  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      });
      req.on('error', (err) => reject(err));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async listTrips(query = {}) {
    const qs = new URLSearchParams(query).toString();
    return this._request('GET', `/api/v1/trips${qs ? '?' + qs : ''}`);
  }

  async getTrip(tripId) {
    return this._request('GET', `/api/v1/trips/${tripId}`);
  }

  async cancelTrip(tripId, reason) {
    return this._request('PUT', `/api/v1/trips/${tripId}/cancel`, { reason });
  }

  async health() {
    return this._request('GET', '/health');
  }
}

/**
 * RbacServiceClient - HTTP client to the RBAC module (mounted in API Gateway).
 * Base URL points to the gateway (RBAC router lives under /api/v1/rbac).
 * Auth token (admin) is forwarded so gateway-level authorize() passes.
 */
class RbacServiceClient {
  constructor(baseUrl = process.env.GATEWAY_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.token = process.env.ADMIN_SERVICE_TOKEN || null;
  }

  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (this.token) options.headers.Authorization = `Bearer ${this.token}`;
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      });
      req.on('error', (err) => reject(err));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  /** با توکن مشخص (پاس‌دادن توکن ادمینِ درخواست‌کننده از کنترلر) */
  withToken(token) {
    const c = new RbacServiceClient(this.baseUrl);
    c.token = token || this.token;
    return c;
  }

  listPermissions() { return this._request('GET', '/api/v1/rbac/permissions'); }
  listRoles() { return this._request('GET', '/api/v1/rbac/roles'); }

  getUserRoles(userId) { return this._request('GET', `/api/v1/rbac/users/${userId}/roles`); }
  assignUserRole(userId, roleName, token) {
    return this.withToken(token)._request('PUT', `/api/v1/rbac/users/${userId}/roles`, { roleName });
  }
  revokeUserRole(userId, roleName, token) {
    return this.withToken(token)._request('DELETE', `/api/v1/rbac/users/${userId}/roles/${roleName}`);
  }
}

module.exports = {
  AuthServiceClient,
  TripServiceClient,
  RbacServiceClient,
};
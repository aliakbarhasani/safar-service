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

module.exports = {
  AuthServiceClient,
  TripServiceClient,
};
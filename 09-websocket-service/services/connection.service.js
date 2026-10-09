/**
 * connection.service.js - Socket.io Connection Lifecycle Handlers (P4-1 + P4-2)
 *
 * Registers the top-level connection / disconnect handlers on the io
 * instance. Per-socket feature namespaces (trip room joining, heartbeat,
 * typing indicators, etc.) live here.
 */

/**
 * Register connection handlers on the given io instance.
 * @param {import('socket.io').Server} io
 * @param {Object} [opts]
 * @param {EventEmitter} [opts.eventBus] - inject an EventBus (or mock) for testing
 */
function registerConnectionHandlers(io, { eventBus = null, canAccessTrip = null, isAssignedDriver = null } = {}) {
  // Authorization queries fail closed: DB errors never grant room access.
  const queryTripAccess = async (tripId, userId, role) => {
    const pool = require('../../01-core-system/database/db').getPool();
    const { rows } = await pool.query(
      `SELECT t.passenger_id::text AS passenger_id, d.user_id::text AS driver_user_id
         FROM trips t LEFT JOIN drivers d ON d.id = t.driver_id
        WHERE t.id::text = $1 LIMIT 1`,
      [String(tripId)],
    );
    const trip = rows[0];
    if (!trip) return false;
    const normalizedRole = String(role || '').toLowerCase();
    return normalizedRole === 'admin' || normalizedRole === 'super_admin'
      || String(trip.passenger_id || '') === String(userId)
      || String(trip.driver_user_id || '') === String(userId);
  };
  const queryAssignedDriver = async (tripId, userId) => {
    const pool = require('../../01-core-system/database/db').getPool();
    const { rows } = await pool.query(
      `SELECT 1 FROM trips t JOIN drivers d ON d.id = t.driver_id
        WHERE t.id::text = $1 AND d.user_id::text = $2 LIMIT 1`,
      [String(tripId), String(userId)],
    );
    return rows.length > 0;
  };
  const hasTripAccess = canAccessTrip || queryTripAccess;
  const isTripDriver = isAssignedDriver || queryAssignedDriver;

  let bus;
  try {
    // eslint-disable-next-line global-require
    bus = eventBus || require('../../01-core-system/EventBus');
  } catch (_) {
    bus = null;
  }

  io.on('connection', (socket) => {
    const user = socket.user || {};
    console.log(
      `[WS] user connected: ${user.userId || user.id} (role: ${user.role}) — socket ${socket.id}`,
    );

    // Joining a trip room requires proof of passenger/assigned-driver ownership.
    socket.on('join:trip', async (tripId) => {
      const userId = user.userId || user.id;
      if (!tripId || !userId) return;
      try {
        if (await hasTripAccess(tripId, userId, user.role)) {
          socket.join(`trip:${tripId}`);
          console.log(`[WS] ${userId} joined authorized trip room ${tripId}`);
        } else {
          console.warn(`[WS] denied trip room access for user ${userId}`);
        }
      } catch (err) {
        console.warn('[WS] trip room authorization failed closed:', err.message);
      }
    });

    socket.on('leave:trip', (tripId) => {
      if (tripId) socket.leave(`trip:${tripId}`);
    });

    // Only authenticated driver/courier accounts can publish valid GPS coordinates.
    socket.on('DRIVER_LOCATION', async (data) => {
      const u = socket.user || {};
      const driverId = u.userId || u.id;
      const role = String(u.role || '').toLowerCase();
      if (!driverId || (!role.includes('driver') && !role.includes('courier'))) return;

      const lat = Number(data && data.lat);
      const lng = Number(data && data.lng);
      const tripId = data && data.tripId;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)
          || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      // A driver may only broadcast into a trip assigned to that driver's account.
      if (tripId) {
        try {
          if (!(await isTripDriver(tripId, driverId))) {
            console.warn('[WS] denied location broadcast for an unassigned trip');
            return;
          }
        } catch (err) {
          console.warn('[WS] trip driver verification failed closed:', err.message);
          return;
        }
      }

      if (bus) {
        try {
          bus.emit('DriverLocationUpdated', {
            driverId,
            latitude: lat,
            longitude: lng,
            tripId: tripId || null,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[WS] EventBus emit DriverLocationUpdated failed:', err.message);
        }
      }

      if (tripId) {
        socket.to(`trip:${tripId}`).emit('DRIVER_MOVED', { lat, lng, driverId });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WS] user disconnected: ${user.userId || user.id} — socket ${socket.id}`);
    });
  });
}

module.exports = { registerConnectionHandlers };

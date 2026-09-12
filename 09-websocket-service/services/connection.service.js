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
function registerConnectionHandlers(io, { eventBus = null } = {}) {
  // Resolve EventBus lazily so tests can inject a mock.
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

    // ── Join a trip room (client-driven) ─────────────────────────────────
    socket.on('join:trip', (tripId) => {
      if (tripId) {
        socket.join(`trip:${tripId}`);
        console.log(`[WS] ${user.userId || user.id} joined trip room ${tripId}`);
      }
    });

    socket.on('leave:trip', (tripId) => {
      if (tripId) {
        socket.leave(`trip:${tripId}`);
      }
    });

    // ── دریافت موقعیت مکانی راننده (P4-2) ──────────────────────────────
    // راننده موقعیت خود را ارسال می‌کند؛ سرور آن را به EventBus منتشر می‌کند
    // و (در صورت وجود tripId) به اتاق سفر برادکست می‌کند تا مسافر روی نقشه ببیند
    socket.on('DRIVER_LOCATION', (data) => {
      const u = socket.user || {};
      const driverId = u.userId || u.id;
      if (!driverId) return;

      const lat = parseFloat(data && data.lat);
      const lng = parseFloat(data && data.lng);
      const tripId = data && data.tripId;

      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      // انتشار رویداد در EventBus تا سرویس Location آن را مصرف کند
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

      // برادکست به اتاق سفر (در صورت وجود) تا مسافر موقعیت را روی نقشه ببیند
      if (tripId) {
        socket.to(`trip:${tripId}`).emit('DRIVER_MOVED', {
          lat,
          lng,
          driverId,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WS] user disconnected: ${user.userId || user.id} — socket ${socket.id}`);
    });
  });
}

module.exports = { registerConnectionHandlers };

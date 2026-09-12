/**
 * connection.service.js - Socket.io Connection Lifecycle Handlers (P4-1)
 *
 * Registers the top-level connection / disconnect handlers on the io
 * instance. Per-socket feature namespaces (trip room joining, heartbeat,
 * typing indicators, etc.) live here.
 */

/**
 * Register connection handlers on the given io instance.
 * @param {import('socket.io').Server} io
 */
function registerConnectionHandlers(io) {
  io.on('connection', (socket) => {
    const user = socket.user || {};
    console.log(
      `[WS] user connected: ${user.id} (role: ${user.role}) — socket ${socket.id}`,
    );

    // ── Join a trip room (client-driven) ─────────────────────────────────
    socket.on('join:trip', (tripId) => {
      if (tripId) {
        socket.join(`trip:${tripId}`);
        console.log(`[WS] ${user.id} joined trip room ${tripId}`);
      }
    });

    socket.on('leave:trip', (tripId) => {
      if (tripId) {
        socket.leave(`trip:${tripId}`);
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[WS] user disconnected: ${user.id} — reason: ${reason}`);
    });
  });
}

module.exports = { registerConnectionHandlers };

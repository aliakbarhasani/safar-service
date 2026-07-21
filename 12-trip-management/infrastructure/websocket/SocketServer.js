const { Server } = require('socket.io');

class SocketServer {
  constructor(httpServer, options = {}) {
    if (!httpServer || typeof httpServer.on !== 'function') {
      throw new Error('SocketServer requires an http server instance');
    }

    this.io = new Server(httpServer, {
      cors: {
        origin: options.corsOrigin || '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      socket.on('join_trip', (payload = {}) => {
        const tripId = payload && payload.tripId ? payload.tripId : null;
        if (!tripId) {
          return;
        }

        const roomName = `trip_${tripId}`;
        socket.join(roomName);
      });

      socket.on('driver_location_update', (payload = {}) => {
        const tripId = payload && payload.tripId ? payload.tripId : null;
        const driverId = payload && payload.driverId ? payload.driverId : 'unknown';
        const lat = payload && payload.lat !== undefined ? payload.lat : null;
        const lng = payload && payload.lng !== undefined ? payload.lng : null;

        if (!tripId || lat === null || lng === null) {
          return;
        }

        const roomName = `trip_${tripId}`;
        const eventPayload = {
          tripId,
          driverId,
          lat,
          lng,
          timestamp: new Date().toISOString(),
        };

        socket.to(roomName).emit('trip_location_updated', eventPayload);
      });
    });
  }
}

module.exports = SocketServer;

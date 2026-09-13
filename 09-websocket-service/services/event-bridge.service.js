/**
 * event-bridge.service.js - Event Bus → WebSocket Bridge (P4-1)
 *
 * Subscribes to domain events published on the central EventBus
 * (01-core-system/EventBus) and fans them out to the appropriate
 * Socket.io rooms / sockets.
 *
 * Event mapping:
 *   TripProposedToDriver  → io.to(driverId).emit('TRIP_PROPOSED', data)
 *   DriverAccepted        → io.to(passengerId).emit('DRIVER_ACCEPTED', data)
 *                         + io.to(`trip:${tripId}`).emit('TRIP_STATUS_CHANGED', …)
 *   TripStatusChanged     → io.to(passengerId + driverId).emit('TRIP_STATUS_CHANGED', …)
 *   TripCompleted         → io.to(`trip:${tripId}`).emit('TRIP_COMPLETED', …)
 *   TripCancelled         → io.to(`trip:${tripId}`).emit('TRIP_CANCELLED', …)
 *
 * All emit failures are caught and logged — a broken bridge must never
 * crash the WebSocket server.
 */

const config = require('../config');

/**
 * @param {import('socket.io').Server} io
 * @param {Object} [opts]
 * @param {Object} [opts.eventBus] - inject a mock EventBus for testing
 * @returns {Function} unsubscribe / cleanup function
 */
function registerEventBridge(io, { eventBus = null } = {}) {
  let bus;
  try {
    // eslint-disable-next-line global-require
    bus = eventBus || require('../../01-core-system/EventBus');
  } catch (err) {
    console.warn(
      '[WS EventBridge] EventBus unavailable, bridge disabled:',
      err.message,
    );
    return () => {};
  }

  const handlers = {
    TripProposedToDriver: (data) => {
      const { driverId, tripId } = data || {};
      if (driverId) {
        safeEmit(io, driverId, 'TRIP_PROPOSED', data);
      }
    },

    DriverAccepted: (data) => {
      const { passengerId, driverId, tripId } = data || {};
      if (passengerId) {
        safeEmit(io, passengerId, 'DRIVER_ACCEPTED', data);
      }
      if (tripId) {
        safeEmit(io, `trip:${tripId}`, 'TRIP_STATUS_CHANGED', {
          tripId,
          newStatus: 'ACCEPTED',
          driverId,
        });
        // P4-2: اتصال مسافر و راننده به یک اتاق مشترک سفر
        // تا بتوانند موقعیت مکانی و وضعیت سفر را به صورت بلادرنگ دریافت کنند
        try {
          io.in(passengerId).socketsJoin(`trip:${tripId}`);
          io.in(driverId).socketsJoin(`trip:${tripId}`);
        } catch (err) {
          console.error(`[WS EventBridge] socketsJoin trip:${tripId} failed:`, err.message);
        }
      }
    },

    TripStatusChanged: (data) => {
      const { passengerId, driverId, tripId } = data || {};
      if (passengerId) safeEmit(io, passengerId, 'TRIP_STATUS_CHANGED', data);
      if (driverId) safeEmit(io, driverId, 'TRIP_STATUS_CHANGED', data);
      if (tripId) safeEmit(io, `trip:${tripId}`, 'TRIP_STATUS_CHANGED', data);
    },

    TripCompleted: (data) => {
      const { tripId } = data || {};
      if (tripId) safeEmit(io, `trip:${tripId}`, 'TRIP_COMPLETED', data);
    },

    TripCancelled: (data) => {
      const { tripId } = data || {};
      if (!tripId) return;
      // P7-1: طرف مقابل (راننده/مسافر) بلافاصله روی نقشه لغو سفر را می‌بیند
      safeEmit(io, `trip:${tripId}`, 'TRIP_CANCELLED', data);
      // P7-1: خروج تمام سوکت‌ها از روم سفر (چرخه حیات روم پایان یافت)
      try {
        io.in(`trip:${tripId}`).socketsLeave(`trip:${tripId}`);
      } catch (err) {
        console.error(`[WS EventBridge] socketsLeave trip:${tripId} failed:`, err.message);
      }
    },
  };

  // Subscribe
  for (const [event, handler] of Object.entries(handlers)) {
    try {
      bus.on(event, handler);
    } catch (err) {
      console.error(`[WS EventBridge] failed to subscribe to ${event}:`, err.message);
    }
  }

  // Cleanup
  return function unregister() {
    for (const [event, handler] of Object.entries(handlers)) {
      try {
        bus.off(event, handler);
      } catch (_) {
        /* ignore */
      }
    }
  };
}

/**
 * Emit to a room / socket, swallowing errors so a broken bridge never
 * crashes the WebSocket server.
 */
function safeEmit(io, room, eventName, payload) {
  try {
    io.to(room).emit(eventName, payload);
  } catch (err) {
    console.error(`[WS EventBridge] emit ${eventName} to ${room} failed:`, err.message);
  }
}

module.exports = { registerEventBridge, safeEmit };

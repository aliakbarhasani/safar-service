/**
 * websocket-tracking.test.js - P4-2 Integration Test (Pure Mock)
 *
 * Validates the real-time tracking pipeline without external dependencies:
 *   1. Driver and passenger connect via WebSocket (with JWT auth)
 *   2. Both join a shared trip room (via DriverAccepted event)
 *   3. Driver sends DRIVER_LOCATION
 *   4. Passenger receives DRIVER_MOVED broadcast
 *   5. Location service consumes DriverLocationUpdated event
 */

const { EventEmitter } = require('events');

// ---- Mock EventBus ----
const mockEventBus = new EventEmitter();

// ---- Mock Location Service ----
const mockLocationService = {
  updateDriverLocation: jest.fn().mockResolvedValue({ success: true }),
};

// ---- Mock Socket.io Server ----
function createMockIoServer() {
  const sockets = new Map();
  const rooms = new Map();
  const handlers = {};

  const io = {
    sockets: { sockets },
    on(event, handler) {
      handlers[event] = handler;
    },
    // Simulate a new socket connection (for testing)
    _simulateConnection(sock) {
      sockets.set(sock.id, sock);
      if (handlers.connection) handlers.connection(sock);
    },
    in(roomId) {
      return {
        socketsJoin(rid) {
          if (!rooms.has(rid)) rooms.set(rid, new Set());
          const room = rooms.get(rid);
          for (const [id] of sockets) {
            room.add(id);
          }
        },
      };
    },
    to(roomId) {
      return {
        emit(event, data) {
          const room = rooms.get(roomId);
          if (room) {
            for (const id of room) {
              const sock = sockets.get(id);
              if (sock) sock._emitClient(event, data);
            }
          }
        },
      };
    },
    _registerSocket(sock) { sockets.set(sock.id, sock); },
  };
  return io;
}

// ---- Mock Socket ----
function createMockSocket(id, user) {
  const clientEmitter = new EventEmitter();
  const serverEmitter = new EventEmitter();
  const socket = {
    id,
    user,
    rooms: new Set(),
    handshake: { auth: { token: null } },
    join(roomId) { this.rooms.add(roomId); },
    to() { return { emit: () => {} }; },
    on: serverEmitter.on.bind(serverEmitter),
    once: serverEmitter.once.bind(serverEmitter),
    emit: (event, data) => serverEmitter.emit(event, data),
    _emitClient: (event, data) => clientEmitter.emit(event, data),
    _clientOn: clientEmitter.on.bind(clientEmitter),
    _clientOnce: clientEmitter.once.bind(clientEmitter),
    _serverEmitter: serverEmitter,
    _clientEmitter: clientEmitter,
  };
  return socket;
}

// ---- Test Setup ----
const TRIP_ID = 'trip-123';
const DRIVER_ID = 'driver-456';
const PASSENGER_ID = 'passenger-789';

let io, driverSocket, passengerSocket;

beforeAll(() => {
  jest.resetModules();
  io = createMockIoServer();

  driverSocket = createMockSocket('sock-driver', { userId: DRIVER_ID, role: 'driver' });
  passengerSocket = createMockSocket('sock-passenger', { userId: PASSENGER_ID, role: 'passenger' });

  io._registerSocket(driverSocket);
  io._registerSocket(passengerSocket);

  const { registerConnectionHandlers } = require('../services/connection.service');
  registerConnectionHandlers(io, { eventBus: mockEventBus });

  const { registerEventBridge } = require('../services/event-bridge.service');
  registerEventBridge(io, { eventBus: mockEventBus });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('P4-2: Real-time trip tracking', () => {
  test('DriverAccepted joins both to trip room', () => {
    mockEventBus.emit('DriverAccepted', {
      tripId: TRIP_ID,
      driverId: DRIVER_ID,
      passengerId: PASSENGER_ID,
    });
    expect(driverSocket.rooms.has('trip:' + TRIP_ID)).toBe(true);
    expect(passengerSocket.rooms.has('trip:' + TRIP_ID)).toBe(true);
  });

  test('DRIVER_LOCATION broadcasts DRIVER_MOVED to trip room (passenger receives)', (done) => {
    passengerSocket._clientOnce('DRIVER_MOVED', (payload) => {
      expect(payload.lat).toBeCloseTo(35.6892);
      expect(payload.lng).toBeCloseTo(51.389);
      expect(payload.driverId).toBe(DRIVER_ID);
      done();
    });
    driverSocket._serverEmitter.emit('DRIVER_LOCATION', {
      lat: 35.6892,
      lng: 51.389,
      tripId: TRIP_ID,
    });
  });

  test('DRIVER_LOCATION publishes DriverLocationUpdated to EventBus', (done) => {
    const handler = jest.fn((data) => {
      expect(data.driverId).toBe(DRIVER_ID);
      expect(data.latitude).toBeCloseTo(35.7);
      expect(data.longitude).toBeCloseTo(51.4);
      expect(data.tripId).toBe(TRIP_ID);
      done();
    });
    mockEventBus.once('DriverLocationUpdated', handler);
    driverSocket._serverEmitter.emit('DRIVER_LOCATION', {
      lat: 35.7,
      lng: 51.4,
      tripId: TRIP_ID,
    });
  });

  test('DRIVER_LOCATION without tripId does not broadcast to room', (done) => {
    const handler = jest.fn();
    passengerSocket._clientOnce('DRIVER_MOVED', handler);
    driverSocket._serverEmitter.emit('DRIVER_LOCATION', {
      lat: 35.8,
      lng: 51.5,
    });
    setTimeout(() => {
      expect(handler).not.toHaveBeenCalled();
      done();
    }, 50);
  });

  test('DriverLocationUpdated handler calls locationService.updateDriverLocation', async () => {
    const { DriverLocationUpdatedHandler } = require('../../../08-location-service/handlers/DriverLocationUpdated.handler');
    const handler = new DriverLocationUpdatedHandler({ eventBus: mockEventBus, locationService: mockLocationService });
    await handler.handle({ driverId: DRIVER_ID, latitude: 35.9, longitude: 51.6 });
    expect(mockLocationService.updateDriverLocation).toHaveBeenCalledWith(DRIVER_ID, 51.6, 35.9);
  });
});

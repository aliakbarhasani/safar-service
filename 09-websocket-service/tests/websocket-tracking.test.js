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
  const sockets = new Map(); // socketId -> socket
  const userIndex = new Map(); // userId -> socketId
  const roomMembers = new Map(); // roomId -> Set<socketId>
  const connectionHandlers = [];

  function joinRoom(socketId, roomId) {
    if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Set());
    roomMembers.get(roomId).add(socketId);
    const sock = sockets.get(socketId);
    // The mock socket keeps its joined rooms in `sock.rooms` (a Set).
    if (sock) sock.rooms.add(roomId);
    // Also track by userId for in(userId).socketsJoin()
    if (sock.user && (sock.user.userId || sock.user.id)) {
      userIndex.set(sock.user.userId || sock.user.id, socketId);
    }
  }

  function emitToRoom(roomId, event, data) {
    const members = roomMembers.get(roomId);
    if (!members) return;
    for (const socketId of members) {
      const sock = sockets.get(socketId);
      if (sock) sock._emitClient(event, data);
    }
  }

  const io = {
    sockets: { sockets },
    on(event, handler) {
      connectionHandlers.push({ event, handler });
      // Dispatch the new connection handler to already-registered sockets so
      // their socket.on(...) listeners (e.g. DRIVER_LOCATION) get attached.
      if (event === 'connection') {
        for (const sock of sockets.values()) handler(sock);
      }
    },
    _simulateConnection(sock) {
      // eslint-disable-next-line no-undefined
      if (connectionHandlers.length && connectionHandlers[0].event === 'connection') {
        connectionHandlers[0].handler(sock);
      }
    },
    in(target) {
      return {
        socketsJoin(roomId) {
          // target can be a socketId or a userId
          if (sockets.has(target)) {
            joinRoom(target, roomId);
          } else if (userIndex.has(target)) {
            joinRoom(userIndex.get(target), roomId);
          }
        },
      };
    },
    to(roomId) {
      return {
        emit(event, data) {
          emitToRoom(roomId, event, data);
        },
      };
    },
    emitToRoom,
    _registerSocket(sock) {
      sockets.set(sock.id, sock);
      sock._ioServer = io;
      if (sock.user && (sock.user.userId || sock.user.id)) {
        userIndex.set(sock.user.userId || sock.user.id, sock.id);
      }
      for (const ch of connectionHandlers) {
        ch.handler(sock);
      }
    },
  };

  return { io, joinRoom, sockets, userIndex, roomMembers, emitToRoom };
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
    leave(roomId) { this.rooms.delete(roomId); },
    to: (roomId) => {
      // Delegate to ioServer if registered, else no-op
      if (socket._ioServer) {
        return {
          emit(event, data) {
            socket._ioServer.emitToRoom(roomId, event, data);
          },
        };
      }
      return { emit: () => {} };
    },
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
  const mock = createMockIoServer();
  io = mock.io; // the actual mock server (with closures)

  driverSocket = createMockSocket('sock-driver', { userId: DRIVER_ID, role: 'driver' });
  passengerSocket = createMockSocket('sock-passenger', { userId: PASSENGER_ID, role: 'passenger' });

  // Pre-register sockets so userIndex maps userId -> socketId BEFORE
  // connection.service / event-bridge.service attach their listeners.
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
    const { DriverLocationUpdatedHandler } = require('../../08-location-service/handlers/DriverLocationUpdated.handler');
    const handler = new DriverLocationUpdatedHandler({ eventBus: mockEventBus, locationService: mockLocationService });
    await handler.handle({ driverId: DRIVER_ID, latitude: 35.9, longitude: 51.6 });
    expect(mockLocationService.updateDriverLocation).toHaveBeenCalledWith(DRIVER_ID, 51.6, 35.9);
  });
});

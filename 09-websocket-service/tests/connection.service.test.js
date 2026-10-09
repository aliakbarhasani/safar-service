const { registerConnectionHandlers } = require('../services/connection.service');

function makeHarness(user, access = true, assigned = true) {
  const handlers = {};
  const joins = [];
  const leaves = [];
  const broadcasts = [];
  const emitted = [];
  const socket = {
    id: 'socket-1',
    user,
    on: (event, handler) => { handlers[event] = handler; },
    join: (room) => joins.push(room),
    leave: (room) => leaves.push(room),
    to: (room) => ({ emit: (event, payload) => broadcasts.push({ room, event, payload }) }),
  };
  const io = { on: (event, handler) => { if (event === 'connection') io.connection = handler; } };
  const eventBus = { emit: (...args) => emitted.push(args) };
  registerConnectionHandlers(io, {
    eventBus,
    canAccessTrip: async () => access,
    isAssignedDriver: async () => assigned,
  });
  io.connection(socket);
  return { handlers, joins, leaves, broadcasts, emitted };
}

describe('WebSocket trip authorization', () => {
  test('does not join a trip room when ownership check denies access', async () => {
    const h = makeHarness({ userId: 'passenger-2', role: 'passenger' }, false);
    await h.handlers['join:trip']('trip-1');
    expect(h.joins).toEqual([]);
  });

  test('allows an authorized passenger to join a trip room', async () => {
    const h = makeHarness({ userId: 'passenger-1', role: 'passenger' }, true);
    await h.handlers['join:trip']('trip-1');
    expect(h.joins).toContain('trip:trip-1');
  });

  test('rejects location updates from non-driver roles', async () => {
    const h = makeHarness({ userId: 'passenger-1', role: 'passenger' });
    await h.handlers.DRIVER_LOCATION({ lat: 35, lng: 51, tripId: 'trip-1' });
    expect(h.emitted).toHaveLength(0);
    expect(h.broadcasts).toHaveLength(0);
  });

  test('rejects driver location broadcasts to trips not assigned to that driver', async () => {
    const h = makeHarness({ userId: 'driver-user-1', role: 'driver' }, true, false);
    await h.handlers.DRIVER_LOCATION({ lat: 35, lng: 51, tripId: 'trip-1' });
    expect(h.emitted).toHaveLength(0);
    expect(h.broadcasts).toHaveLength(0);
  });

  test('rejects out-of-range GPS coordinates', async () => {
    const h = makeHarness({ userId: 'driver-user-1', role: 'driver' });
    await h.handlers.DRIVER_LOCATION({ lat: 120, lng: 51, tripId: 'trip-1' });
    expect(h.emitted).toHaveLength(0);
    expect(h.broadcasts).toHaveLength(0);
  });

  test('broadcasts valid GPS only after assignment check', async () => {
    const h = makeHarness({ userId: 'driver-user-1', role: 'driver' }, true, true);
    await h.handlers.DRIVER_LOCATION({ lat: 35, lng: 51, tripId: 'trip-1' });
    expect(h.emitted).toHaveLength(1);
    expect(h.broadcasts).toEqual([{
      room: 'trip:trip-1',
      event: 'DRIVER_MOVED',
      payload: { lat: 35, lng: 51, driverId: 'driver-user-1' },
    }]);
  });
});

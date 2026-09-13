/**
 * DriverReleaseHandler.test.js - P7-1 (مرحله ۴)
 *
 * با لغو سفر، راننده به وضعیت آزاد (online) برمی‌گردد.
 */

const { DriverReleaseHandler } = require('../handlers/TripCancelled.handler');

describe('DriverReleaseHandler (P7-1)', () => {
  function build(driverService) {
    return new DriverReleaseHandler({ eventBus: { on: () => {} }, driverService });
  }

  test('driver with trip is released back to online', async () => {
    const driverService = { updateOperationalStatus: jest.fn().mockResolvedValue({ operationalStatus: 'online' }) };
    const handler = build(driverService);

    const res = await handler.handle({
      event: 'TripCancelled',
      data: { tripId: 'trip-1', driverId: 'd1', passengerId: 'p1', penaltyAmount: 15000 },
    });

    expect(res.released).toBe(true);
    expect(res.driverId).toBe('d1');
    expect(driverService.updateOperationalStatus).toHaveBeenCalledWith('d1', 'online');
  });

  test('trip cancelled before acceptance (no driver) -> nothing to release', async () => {
    const driverService = { updateOperationalStatus: jest.fn() };
    const handler = build(driverService);

    const res = await handler.handle({
      event: 'TripCancelled',
      data: { tripId: 'trip-2', passengerId: 'p1' },
    });

    expect(res.released).toBe(false);
    expect(res.reason).toBe('no_driver_on_trip');
    expect(driverService.updateOperationalStatus).not.toHaveBeenCalled();
  });

  test('release failure never propagates (fire-and-forget)', async () => {
    const driverService = { updateOperationalStatus: jest.fn().mockRejectedValue(new Error('db down')) };
    const handler = build(driverService);

    const res = await handler.handle({
      event: 'TripCancelled',
      data: { tripId: 'trip-3', driverId: 'd2' },
    });

    expect(res.released).toBe(false);
    expect(res.reason).toBe('error');
  });

  test('register() subscribes to the canonical TripCancelled event once', () => {
    const listeners = {};
    const eventBus = { on: (evt) => { listeners[evt] = (listeners[evt] || 0) + 1; } };
    const handler = build({ updateOperationalStatus: () => ({}) });
    handler.register();
    handler.register();
    expect(listeners.TripCancelled).toBe(1);
  });
});
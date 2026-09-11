/**
 * trip-cancelled-handler.test.js - Unit tests for the Wallet TripCancelled subscriber (P2-1)
 *
 * Verifies Event-Driven decoupling: the handler calls the atomic releaseHold
 * (P1-2) with trip-cancel:<tripId> idempotency, tolerates missing/duplicate
 * events, and never throws back to the publisher (Mobility).
 */

const { TripCancelledHandler, CANCEL_EVENTS } = require('../handlers/trip-cancelled.handler');

function makeFakeBus() {
  const subs = {};
  return {
    subs,
    on: jest.fn((event, handler) => {
      subs[event] = subs[event] || [];
      subs[event].push(handler);
    }),
  };
}

describe('TripCancelledHandler (P2-1 event-driven releaseHold)', () => {
  test('subscribes to both cancel events on register()', () => {
    const bus = makeFakeBus();
    const handler = new TripCancelledHandler({ eventBus: bus, walletService: {} });
    handler.register();
    expect(bus.on).toHaveBeenCalledTimes(CANCEL_EVENTS.length);
    for (const evt of CANCEL_EVENTS) {
      expect(bus.subs[evt]).toHaveLength(1);
    }
  });

  test('releases hold with trip-cancel:<tripId> idempotency key', async () => {
    const releaseHold = jest.fn().mockResolvedValue({ transactionId: 'tx-1' });
    const handler = new TripCancelledHandler({ eventBus: makeFakeBus(), walletService: { releaseHold } });

    const res = await handler.handle({
      event: 'TripCancelledByPassenger',
      data: { tripId: 'trip-9', passengerId: 'user-1', heldAmount: 15000, currencyId: 'IRT' },
    });

    expect(res).toMatchObject({ released: true, tripId: 'trip-9', referenceId: 'trip-cancel:trip-9' });
    expect(releaseHold).toHaveBeenCalledTimes(1);
    expect(releaseHold).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      amount: 15000,
      referenceType: 'trip_cancel',
      referenceId: 'trip-cancel:trip-9',
      currencyId: 'IRT',
    }));
  });

  test('duplicate releaseHold is treated as success (deduped)', async () => {
    const releaseHold = jest.fn().mockRejectedValue(new Error('Duplicate transaction for referenceId trip-cancel:t1'));
    const handler = new TripCancelledHandler({ eventBus: makeFakeBus(), walletService: { releaseHold } });

    const res = await handler.handle({
      event: 'TripCancelledByDriver',
      data: { tripId: 't1', passengerId: 'u1', heldAmount: 5000 },
    });

    expect(res).toMatchObject({ released: true, deduped: true, referenceId: 'trip-cancel:t1' });
  });

  test('event without held amount releases nothing (no wallet call)', async () => {
    const releaseHold = jest.fn();
    const handler = new TripCancelledHandler({ eventBus: makeFakeBus(), walletService: { releaseHold } });

    const res = await handler.handle({
      event: 'TripCancelledByPassenger',
      data: { tripId: 't2', passengerId: 'u2' }, // e.g. cash trip, no hold
    });

    expect(res).toMatchObject({ released: false, reason: 'no_held_amount' });
    expect(releaseHold).not.toHaveBeenCalled();
  });

  test('releaseHold failure never throws back to the publisher', async () => {
    const releaseHold = jest.fn().mockRejectedValue(new Error('DB down'));
    const handler = new TripCancelledHandler({ eventBus: makeFakeBus(), walletService: { releaseHold } });

    const res = await handler.handle({
      event: 'TripCancelledByDriver',
      data: { tripId: 't3', passengerId: 'u3', heldAmount: 7000 },
    });

    expect(res).toMatchObject({ released: false, reason: 'release_failed' });
  });
});

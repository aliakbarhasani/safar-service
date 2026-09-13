/**
 * trip-cancelled-penalty.test.js - P7-1 (مرحله ۳ + ۵)
 *
 * هندلر `TripCancelled` در Wallet:
 *  - penaltyAmount > 0  -> فراخوانی `processCancellationPenalty` (اتمیک)
 *    با کلید idempotency `trip-penalty:<tripId>`
 *  - تقسیم: سهم راننده (CANCELLATION_COMPENSATION) + مابقی پلتفرم
 *  - penalty تکراری -> deduped (موفق)
 *  - penaltyAmount = 0 -> مسیر قدیمی releaseHold (P2-1)
 */

const { TripCancelledHandler } = require('../handlers/trip-cancelled.handler');

describe('TripCancelledHandler (P7-1: cancellation fee)', () => {
  function buildHandler(walletService) {
    return new TripCancelledHandler({ eventBus: { on: () => {} }, walletService });
  }

  test('penalty > 0 -> atomic processCancellationPenalty with trip-penalty:<tripId> key', async () => {
    const processCancellationPenalty = jest.fn().mockResolvedValue({
      passengerDebit: 15000,
      driverCompensation: 12000,
      platformShare: 3000,
      debt: false,
    });
    const handler = buildHandler({ processCancellationPenalty, releaseHold: jest.fn() });

    const res = await handler.handle({
      event: 'TripCancelled',
      data: {
        tripId: 'trip-77',
        cancelledBy: 'p1',
        role: 'passenger',
        penaltyAmount: 15000,
        driverId: 'd1',
        passengerId: 'p1',
      },
    });

    expect(res.penaltyProcessed).toBe(true);
    expect(res.tripId).toBe('trip-77');
    expect(res.referenceId).toBe('trip-penalty:trip-77');
    expect(res.driverCompensation).toBe(12000);
    expect(res.platformShare).toBe(3000);
    expect(processCancellationPenalty).toHaveBeenCalledTimes(1);
    expect(processCancellationPenalty).toHaveBeenCalledWith({
      tripId: 'trip-77',
      passengerId: 'p1',
      driverId: 'd1',
      penaltyAmount: 15000,
      currencyId: 'IRT',
    });
    // مسیر hold هرگز نباید فراخوانی شود
    expect(handler.walletService.releaseHold).not.toHaveBeenCalled();
  });

  test('duplicate penalty is treated as success (idempotent dedup)', async () => {
    const processCancellationPenalty = jest.fn().mockRejectedValue(
      new Error('Duplicate transaction reference: trip-penalty:trip-77'),
    );
    const handler = buildHandler({ processCancellationPenalty });

    const res = await handler.handle({
      event: 'TripCancelled',
      data: { tripId: 'trip-77', passengerId: 'p1', driverId: 'd1', penaltyAmount: 15000 },
    });

    expect(res.penaltyProcessed).toBe(true);
    expect(res.deduped).toBe(true);
  });

  test('penalty failure is swallowed (never propagates to Mobility)', async () => {
    const processCancellationPenalty = jest.fn().mockRejectedValue(new Error('db down'));
    const handler = buildHandler({ processCancellationPenalty });

    const res = await handler.handle({
      event: 'TripCancelled',
      data: { tripId: 'trip-88', passengerId: 'p2', penaltyAmount: 15000 },
    });
    expect(res.penaltyProcessed).toBe(false);
    expect(res.reason).toBe('penalty_failed');
  });

  test('penaltyAmount = 0 -> falls back to legacy releaseHold path', async () => {
    const releaseHold = jest.fn().mockResolvedValue({ transactionId: 'tx-1' });
    const handler = buildHandler({ releaseHold });

    const res = await handler.handle({
      event: 'TripCancelledByPassenger',
      data: { tripId: 'trip-9', passengerId: 'p3', heldAmount: 50000 },
    });

    expect(res.released).toBe(true);
    expect(res.referenceId).toBe('trip-cancel:trip-9');
    expect(releaseHold).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'p3', amount: 50000, referenceId: 'trip-cancel:trip-9' }),
    );
  });
});
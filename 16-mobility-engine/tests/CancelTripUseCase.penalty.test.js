/**
 * CancelTripUseCase.penalty.test.js - P7-1 (مرحله ۵)
 *
 * قوانین لغو + جریمه:
 *  - penalty در ARRIVED (مسافر) = baseFare از Config
 *  - penalty در ACCEPTED (مسافر) = baseFare
 *  - penalty در REQUESTED = 0
 *  - penalty برای راننده = 0
 *  - IN_PROGRESS قابل لغو نیست (409 TRIP_NOT_CANCELLABLE)
 *  - غیرمالک مجاز به لغو نیست (403)
 *  - رویداد کانونی TripCancelled با penaltyAmount منتشر می‌شود
 */

const { Pool } = require('pg');
const CancelTripUseCase = require('../application/CancelTripUseCase');

jest.mock('pg', () => {
  const mPool = { query: jest.fn(), connect: jest.fn() };
  return { Pool: jest.fn(() => mPool) };
});

const TRIP_BASE = {
  id: 'trip-1',
  passenger_id: 'p1',
  driver_id: 'd1',
  lifecycle_status: null,
};

function makeTripRepository(dbRow) {
  const db = new Pool();
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  db.connect.mockResolvedValue(client);
  return {
    db,
    client,
    getTripByIdForUpdate: jest.fn().mockResolvedValue(dbRow),
    updateTripStatus: jest.fn().mockImplementation(async (p) => ({
      id: p.tripId,
      status: p.status,
      cancel_reason: p.cancelReason,
    })),
    logStatusChange: jest.fn().mockResolvedValue(),
  };
}

describe('CancelTripUseCase (P7-1: penalty & business rules)', () => {
  let emitted;
  let useCase;
  let repo;

  beforeEach(() => {
    emitted = [];
    // config.trip.baseFare = 15000 (server.config)
  });

  function build(row) {
    repo = makeTripRepository(row);
    useCase = new CancelTripUseCase({
      tripRepository: repo,
      emitEvent: (name, data) => emitted.push({ name, data }),
    });
    return useCase;
  }

  test('passenger cancelling an ARRIVED trip is penalized with baseFare', async () => {
    const uc = build({ ...TRIP_BASE, status: 'ARRIVED' });
    const res = await uc.execute({
      tripId: 'trip-1',
      cancelledByRole: 'passenger',
      cancelledByUserId: 'p1',
      reason: 'changed my mind',
    });
    expect(res.status).toBe('CANCELLED');
    expect(res.penaltyAmount).toBe(15000);
    const canonical = emitted.find((e) => e.name === 'TripCancelled');
    expect(canonical).toBeDefined();
    expect(canonical.data).toEqual({
      tripId: 'trip-1',
      cancelledBy: 'p1',
      role: 'passenger',
      penaltyAmount: 15000,
      driverId: 'd1',
      passengerId: 'p1',
      reason: 'changed my mind',
    });
  });

  test('passenger cancelling an ACCEPTED trip is penalized too', async () => {
    const uc = build({ ...TRIP_BASE, status: 'ACCEPTED' });
    const res = await uc.execute({
      tripId: 'trip-1',
      cancelledByRole: 'passenger',
      cancelledByUserId: 'p1',
      reason: null,
    });
    expect(res.penaltyAmount).toBe(15000);
  });

  test('no penalty when passenger cancels in REQUESTED', async () => {
    const uc = build({ ...TRIP_BASE, driver_id: null, status: 'REQUESTED' });
    const res = await uc.execute({
      tripId: 'trip-1',
      cancelledByRole: 'passenger',
      cancelledByUserId: 'p1',
    });
    expect(res.penaltyAmount).toBe(0);
  });

  test('no penalty when the driver cancels (any cancellable state)', async () => {
    const uc = build({ ...TRIP_BASE, status: 'ACCEPTED' });
    const res = await uc.execute({
      tripId: 'trip-1',
      cancelledByRole: 'driver',
      cancelledByUserId: 'd1',
      reason: 'emergency',
    });
    expect(res.penaltyAmount).toBe(0);
    const canonical = emitted.find((e) => e.name === 'TripCancelled');
    expect(canonical.data.penaltyAmount).toBe(0);
  });

  test('IN_PROGRESS trip is not cancellable (409 TRIP_NOT_CANCELLABLE)', async () => {
    const uc = build({ ...TRIP_BASE, status: 'IN_PROGRESS' });
    await expect(
      uc.execute({ tripId: 'trip-1', cancelledByRole: 'passenger', cancelledByUserId: 'p1' }),
    ).rejects.toMatchObject({ code: 'TRIP_NOT_CANCELLABLE', statusCode: 409 });
  });

  test('non-owner (stranger) cannot cancel (403)', async () => {
    const uc = build({ ...TRIP_BASE, status: 'REQUESTED' });
    await expect(
      uc.execute({ tripId: 'trip-1', cancelledByRole: 'passenger', cancelledByUserId: 'stranger-9' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED_TRIP_CANCEL', statusCode: 403 });
  });

  test('post-commit event listener failure does not report a committed cancellation as failed', async () => {
    const row = { ...TRIP_BASE, status: 'REQUESTED', driver_id: null };
    repo = makeTripRepository(row);
    useCase = new CancelTripUseCase({
      tripRepository: repo,
      emitEvent: () => { throw new Error('listener unavailable'); },
    });

    const result = await useCase.execute({
      tripId: 'trip-1',
      cancelledByRole: 'passenger',
      cancelledByUserId: 'p1',
    });

    expect(result.status).toBe('CANCELLED');
    expect(repo.client.query).toHaveBeenCalledWith('COMMIT');
    expect(repo.client.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(repo.client.release).toHaveBeenCalledTimes(1);
  });

  test('missing tripId -> 400', async () => {
    const uc = build(null);
    await expect(uc.execute({ cancelledByRole: 'passenger' })).rejects.toMatchObject({
      code: 'CANCEL_TRIP_VALIDATION',
      statusCode: 400,
    });
  });
});
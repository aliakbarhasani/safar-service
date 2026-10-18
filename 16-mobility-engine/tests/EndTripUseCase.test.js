/**
 * EndTripUseCase.test.js - Integration-style test for the mobility trip-end
 * use case (P5-1). Verifies the IN_PROGRESS -> COMPLETED transition happens
 * inside a DB transaction, the final fare is resolved (input / estimated /
 * distance), and the `TripCompleted` event carries the settlement payload
 * { tripId, passengerId, driverId, amount, currency } for the Wallet.
 */

const EndTripUseCase = require('../application/EndTripUseCase');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

function makeFakeTripRepo({ tripRow, updatedRow }) {
  const emitted = [];
  const client = {
    query: jest.fn(async (sql) => {
      const text = typeof sql === 'string' ? sql : '';
      if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(async () => {}),
  };
  const repo = {
    db: { connect: jest.fn(async () => client) },
    getTripByIdForUpdate: jest.fn(async () => tripRow),
    updateTripStatus: jest.fn(async () => updatedRow),
    logStatusChange: jest.fn(async () => {}),
    emitted,
    client,
  };
  return repo;
}

function runTrip({ tripRow, updatedRow, finalFare = null, changedByUserId = null }) {
  const repo = makeFakeTripRepo({ tripRow, updatedRow });
  const uc = new EndTripUseCase({
    tripRepository: repo,
    emitEvent: (event, data) => repo.emitted.push({ event, data }),
  });
  return uc.execute({ tripId: 'trip-1', changedByUserId, driverId: tripRow.driver_id, finalFare }).then((result) => ({
    result,
    emitted: repo.emitted,
    repo,
  }));
}

const COMPLETED_ROW = {
  id: 'trip-1',
  status: 'COMPLETED',
  passenger_id: 'user-pass',
  driver_id: 'user-driver',
  currency_id: 'IRT',
  final_cost: 100000,
};

describe('EndTripUseCase (P5-1 trip completion)', () => {
  test('IN_PROGRESS -> COMPLETED and emits TripCompleted with amount/currency', async () => {
    const tripRow = {
      id: 'trip-1',
      status: 'IN_PROGRESS',
      passenger_id: 'user-pass',
      driver_id: 'user-driver',
      estimated_cost: 90000,
      currency_id: 'IRT',
    };
    const { result, emitted } = await runTrip({ tripRow, updatedRow: COMPLETED_ROW, finalFare: 100000 });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalCost).toBe(100000);
    expect(result.amount).toBe(100000);
    expect(result.currency).toBe('IRT');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe(TripDomainEvents.TripCompleted);
    expect(emitted[0].data).toEqual({
      tripId: 'trip-1',
      passengerId: 'user-pass',
      driverId: 'user-driver',
      amount: 100000,
      currency: 'IRT',
    });
  });

  test('falls back to estimated_cost when no finalFare input', async () => {
    const tripRow = {
      id: 'trip-1',
      status: 'IN_PROGRESS',
      passenger_id: 'user-pass',
      driver_id: 'user-driver',
      estimated_cost: 75000,
      currency_id: 'IRT',
    };
    const { emitted } = await runTrip({ tripRow, updatedRow: COMPLETED_ROW });
    expect(emitted[0].data.amount).toBe(75000);
  });

  test('refuses settlement when no authoritative fare is available', async () => {
    const tripRow = {
      id: 'trip-1',
      status: 'IN_PROGRESS',
      passenger_id: 'user-pass',
      driver_id: 'user-driver',
      estimated_cost: 0,
      origin_lat: 35.6892, origin_lng: 51.389,
      dest_lat: 35.832, dest_lng: 50.992,
      currency_id: 'IRT',
    };
    const repo = makeFakeTripRepo({ tripRow, updatedRow: COMPLETED_ROW });
    const uc = new EndTripUseCase({ tripRepository: repo, emitEvent: () => {} });

    await expect(uc.execute({ tripId: 'trip-1', driverId: 'user-driver' })).rejects.toMatchObject({
      code: 'FINAL_FARE_UNAVAILABLE',
      statusCode: 409,
    });
    expect(repo.client.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
    expect(repo.updateTripStatus).not.toHaveBeenCalled();
    expect(repo.emitted).toHaveLength(0);
  });


  test('keeps committed settlement successful if best-effort live event publishing throws', async () => {
    const tripRow = {
      id: 'trip-1',
      status: 'IN_PROGRESS',
      passenger_id: 'user-pass',
      driver_id: 'user-driver',
      estimated_cost: 75000,
      currency_id: 'IRT',
    };
    const repo = makeFakeTripRepo({ tripRow, updatedRow: COMPLETED_ROW });
    const uc = new EndTripUseCase({
      tripRepository: repo,
      emitEvent: () => { throw new Error('temporary publisher failure'); },
    });

    const result = await uc.execute({
      tripId: 'trip-1',
      driverId: 'user-driver',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.amount).toBe(75000);
    expect(repo.client.query).toHaveBeenCalledWith('COMMIT');
    expect(repo.client.query).not.toHaveBeenCalledWith('ROLLBACK');
  });

  test('keeps committed settlement successful if asynchronous live event publishing rejects', async () => {
    const tripRow = {
      id: 'trip-1',
      status: 'IN_PROGRESS',
      passenger_id: 'user-pass',
      driver_id: 'user-driver',
      estimated_cost: 75000,
      currency_id: 'IRT',
    };
    const repo = makeFakeTripRepo({ tripRow, updatedRow: COMPLETED_ROW });
    const uc = new EndTripUseCase({
      tripRepository: repo,
      emitEvent: async () => { throw new Error('asynchronous publisher failure'); },
    });

    const result = await uc.execute({ tripId: 'trip-1', driverId: 'user-driver' });

    expect(result.status).toBe('COMPLETED');
    expect(result.amount).toBe(75000);
    expect(repo.client.query).toHaveBeenCalledWith('COMMIT');
    expect(repo.client.query).not.toHaveBeenCalledWith('ROLLBACK');
  });

  test('rejects completion when the authenticated driver is not assigned to the trip', async () => {
    const tripRow = {
      id: 'trip-1',
      status: 'IN_PROGRESS',
      passenger_id: 'user-pass',
      driver_id: 'assigned-driver',
      estimated_cost: 75000,
      currency_id: 'IRT',
    };
    const repo = makeFakeTripRepo({ tripRow, updatedRow: COMPLETED_ROW });
    const uc = new EndTripUseCase({ tripRepository: repo, emitEvent: () => {} });

    await expect(uc.execute({
      tripId: 'trip-1',
      driverId: 'different-driver',
    })).rejects.toMatchObject({ code: 'TRIP_FORBIDDEN', statusCode: 403 });

    expect(repo.updateTripStatus).not.toHaveBeenCalled();
    expect(repo.client.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
  });

  test('throws TripNotFoundError when the trip does not exist', async () => {
    const repo = makeFakeTripRepo({ tripRow: null, updatedRow: COMPLETED_ROW });
    const uc = new EndTripUseCase({ tripRepository: repo, emitEvent: () => {} });
    await expect(uc.execute({ tripId: 'missing' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('rolls back on an invalid state transition (non IN_PROGRESS)', async () => {
    const tripRow = { id: 'trip-1', status: 'REQUESTED', passenger_id: 'p', driver_id: 'd' };
    const repo = makeFakeTripRepo({ tripRow, updatedRow: COMPLETED_ROW });
    const uc = new EndTripUseCase({ tripRepository: repo, emitEvent: () => {} });
    await expect(uc.execute({ tripId: 'trip-1' })).rejects.toMatchObject({
      code: 'INVALID_RIDE_STATE_TRANSITION',
    });
    expect(repo.client.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
  });
});
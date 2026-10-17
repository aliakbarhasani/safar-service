'use strict';

const ArriveAtPickupUseCase = require('../application/ArriveAtPickupUseCase');
const StartTripUseCase = require('../application/StartTripUseCase');
const TripRepository = require('../infrastructure/TripRepository');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

function makeRepo({ row, updated, outboxRepository = { insert: jest.fn().mockResolvedValue({ id: 'evt-1' }) } }) {
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  };
  const repository = {
    db: { connect: jest.fn().mockResolvedValue(client) },
    getTripByIdForUpdate: jest.fn().mockResolvedValue(row),
    updateTripStatus: jest.fn().mockResolvedValue(updated),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
    outboxRepository,
  };
  return { repository, client, outboxRepository };
}

describe('ArriveAtPickupUseCase durable lifecycle events', () => {
  const row = {
    id: 'trip-1', status: 'ACCEPTED', driver_id: 'driver-1', passenger_id: 'passenger-1',
  };
  const updated = { ...row, status: 'ARRIVED' };

  test('persists DriverArrived in the same transaction and does not report false failure when live publish throws', async () => {
    const ctx = makeRepo({ row, updated });
    const emitEvent = jest.fn(async () => { throw new Error('temporary event bus failure'); });
    const useCase = new ArriveAtPickupUseCase({ tripRepository: ctx.repository, emitEvent });

    const result = await useCase.execute({
      tripId: 'trip-1', driverId: 'driver-1', changedByUserId: 'driver-user-1', actorRole: 'driver',
    });

    expect(result).toMatchObject({ tripId: 'trip-1', status: 'ARRIVED', driverId: 'driver-1' });
    expect(ctx.outboxRepository.insert).toHaveBeenCalledWith({
      aggregateId: 'trip-1',
      eventType: TripDomainEvents.DriverArrived,
      payload: { tripId: 'trip-1', driverId: 'driver-1', passengerId: 'passenger-1' },
    }, ctx.client);
    expect(ctx.client.query).toHaveBeenCalledWith('COMMIT');
    expect(ctx.client.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(emitEvent).toHaveBeenCalledWith(TripDomainEvents.DriverArrived, {
      tripId: 'trip-1', driverId: 'driver-1', passengerId: 'passenger-1',
    });
  });

  test('rejects a different driver and writes neither status nor outbox event', async () => {
    const ctx = makeRepo({ row, updated });
    const emitEvent = jest.fn();
    const useCase = new ArriveAtPickupUseCase({ tripRepository: ctx.repository, emitEvent });

    await expect(useCase.execute({
      tripId: 'trip-1', driverId: 'driver-2', actorRole: 'driver',
    })).rejects.toMatchObject({ code: 'TRIP_FORBIDDEN', statusCode: 403 });

    expect(ctx.repository.updateTripStatus).not.toHaveBeenCalled();
    expect(ctx.outboxRepository.insert).not.toHaveBeenCalled();
    expect(ctx.client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe('StartTripUseCase durable events and started_at persistence', () => {
  const startedAt = new Date('2026-10-17T00:00:00.000Z');
  const row = {
    id: 'trip-2', status: 'ARRIVED', driver_id: 'driver-1', passenger_id: 'passenger-1',
  };
  const updated = { ...row, status: 'IN_PROGRESS', started_at: startedAt };

  test('persists started_at and TripStarted in the transaction; live publish failure does not undo a committed trip', async () => {
    const ctx = makeRepo({ row, updated });
    const emitEvent = jest.fn(async () => { throw new Error('temporary event bus failure'); });
    const useCase = new StartTripUseCase({ tripRepository: ctx.repository, emitEvent });

    const result = await useCase.execute({
      tripId: 'trip-2', driverId: 'driver-1', changedByUserId: 'driver-user-1', actorRole: 'driver',
    });

    expect(result).toMatchObject({ tripId: 'trip-2', status: 'IN_PROGRESS', driverId: 'driver-1' });
    expect(ctx.repository.updateTripStatus).toHaveBeenCalledWith({
      tripId: 'trip-2', status: 'IN_PROGRESS', startedAt: expect.any(Date),
    }, ctx.client);
    const outboxCall = ctx.outboxRepository.insert.mock.calls[0];
    expect(outboxCall[0]).toMatchObject({
      aggregateId: 'trip-2',
      eventType: TripDomainEvents.TripStarted,
      payload: {
        tripId: 'trip-2', driverId: 'driver-1', passengerId: 'passenger-1',
        startedAt: startedAt.toISOString(),
      },
    });
    expect(outboxCall[1]).toBe(ctx.client);
    expect(ctx.client.query).toHaveBeenCalledWith('COMMIT');
    expect(ctx.client.query).not.toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('TripRepository started_at persistence', () => {
  test('writes the supplied startedAt once when entering IN_PROGRESS', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'trip-3', status: 'IN_PROGRESS' }] }),
    };
    const repository = new TripRepository({});
    const startedAt = new Date('2026-10-17T00:00:00.000Z');

    await repository.updateTripStatus({ tripId: 'trip-3', status: 'IN_PROGRESS', startedAt }, client);

    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain("started_at       = CASE WHEN $2 = 'IN_PROGRESS'");
    expect(sql).toContain('COALESCE(started_at, $8, NOW())');
    expect(values[1]).toBe('IN_PROGRESS');
    expect(values[7]).toBe(startedAt);
  });
});

'use strict';

const DriverArrivedUseCase = require('../application/DriverArrivedUseCase');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

function makeUseCase({ driverIdOnTrip = 'driver-1', status = 'ACCEPTED' } = {}) {
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  };
  const row = {
    id: 'trip-1',
    status,
    driver_id: driverIdOnTrip,
    passenger_id: 'passenger-1',
  };
  const updated = { ...row, status: 'ARRIVED' };
  const tripRepository = {
    db: { connect: jest.fn().mockResolvedValue(client) },
    getTripByIdForUpdate: jest.fn().mockResolvedValue(row),
    updateTripStatus: jest.fn().mockResolvedValue(updated),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
  };
  const emitEvent = jest.fn();
  return {
    useCase: new DriverArrivedUseCase({ tripRepository, emitEvent }),
    tripRepository,
    client,
    emitEvent,
  };
}

describe('DriverArrivedUseCase ownership authorization', () => {
  test('allows the assigned driver and records ARRIVED inside the transaction', async () => {
    const { useCase, tripRepository, client, emitEvent } = makeUseCase();

    const result = await useCase.execute({
      tripId: 'trip-1',
      driverId: 'driver-1',
      changedByUserId: 'driver-user-1',
      actorRole: 'driver',
    });

    expect(result).toMatchObject({ tripId: 'trip-1', status: 'ARRIVED', driverId: 'driver-1' });
    expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(
      { tripId: 'trip-1', status: 'ARRIVED' },
      client,
    );
    expect(tripRepository.logStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 'trip-1',
      oldStatus: 'ACCEPTED',
      newStatus: 'ARRIVED',
      changedByUserId: 'driver-user-1',
      changedByRole: 'driver',
      reason: 'driver_arrived',
    }), client);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(emitEvent).toHaveBeenCalledWith(TripDomainEvents.DriverArrived, {
      tripId: 'trip-1',
      driverId: 'driver-1',
    });
  });

  test('rejects a different driver before changing state and rolls back', async () => {
    const { useCase, tripRepository, client, emitEvent } = makeUseCase();

    await expect(useCase.execute({
      tripId: 'trip-1',
      driverId: 'driver-2',
      changedByUserId: 'driver-user-2',
      actorRole: 'driver',
    })).rejects.toMatchObject({ code: 'TRIP_FORBIDDEN', statusCode: 403 });

    expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    expect(tripRepository.logStatusChange).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(emitEvent).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects missing driver identity and fails closed', async () => {
    const { useCase, tripRepository } = makeUseCase();

    await expect(useCase.execute({ tripId: 'trip-1' }))
      .rejects.toMatchObject({ code: 'TRIP_FORBIDDEN', statusCode: 403 });

    expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
  });

  test('allows super admin override and records the acting role', async () => {
    const { useCase, tripRepository, client } = makeUseCase();

    await useCase.execute({
      tripId: 'trip-1',
      changedByUserId: 'admin-user-1',
      actorRole: 'SUPER_ADMIN',
    });

    expect(tripRepository.updateTripStatus).toHaveBeenCalled();
    expect(tripRepository.logStatusChange).toHaveBeenCalledWith(expect.objectContaining({
      changedByUserId: 'admin-user-1',
      changedByRole: 'super_admin',
    }), client);
  });

  test('does not bypass lifecycle validation for the assigned driver', async () => {
    const { useCase, tripRepository, client, emitEvent } = makeUseCase({ status: 'REQUESTED' });

    await expect(useCase.execute({
      tripId: 'trip-1',
      driverId: 'driver-1',
      actorRole: 'driver',
    })).rejects.toMatchObject({ code: 'INVALID_RIDE_STATE_TRANSITION' });

    expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

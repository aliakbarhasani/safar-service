'use strict';

const AcceptTripUseCase = require('../application/AcceptTripUseCase');
const TripStatus = require('../domain/enums/TripStatus');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

function makeUseCase(status) {
  const updatedTrip = {
    id: 'trip-1',
    status: TripStatus.ACCEPTED,
    driver_id: 'driver-1',
    passenger_id: 'passenger-1',
    origin_lat: 35.7,
    origin_lng: 51.4,
    dest_lat: 35.8,
    dest_lng: 51.5,
  };
  const tripRepository = {
    getTripById: jest.fn().mockResolvedValue({ id: 'trip-1', status }),
    updateTripStateAtomic: jest.fn().mockResolvedValue(updatedTrip),
  };
  const redis = { del: jest.fn().mockResolvedValue(1) };
  const tripOfferRepository = {
    getOffer: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    lockTrip: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(true),
    redis,
  };
  const emitEvent = jest.fn();
  return {
    useCase: new AcceptTripUseCase({ tripRepository, tripOfferRepository, emitEvent }),
    tripRepository,
    tripOfferRepository,
    emitEvent,
  };
}

describe('AcceptTripUseCase lifecycle state compatibility', () => {
  test.each([TripStatus.SEARCHING, TripStatus.REQUESTED])(
    'accepts a valid offer from %s and atomically checks that exact state',
    async (status) => {
      const { useCase, tripRepository, emitEvent } = makeUseCase(status);

      const result = await useCase.acceptOffer({
        tripId: 'trip-1',
        driverId: 'driver-1',
        changedByUserId: 'user-1',
      });

      expect(result).toMatchObject({
        tripId: 'trip-1',
        status: TripStatus.ACCEPTED,
        driverId: 'driver-1',
        passengerId: 'passenger-1',
      });
      expect(tripRepository.updateTripStateAtomic).toHaveBeenCalledWith(expect.objectContaining({
        tripId: 'trip-1',
        expectedState: status,
        targetState: TripStatus.ACCEPTED,
        driverId: 'driver-1',
      }));
      expect(emitEvent).toHaveBeenCalledWith(TripDomainEvents.DriverAccepted, expect.objectContaining({
        tripId: 'trip-1',
        driverId: 'driver-1',
      }));
    },
  );

  test('rejects a terminal trip and releases the distributed lock', async () => {
    const { useCase, tripRepository, tripOfferRepository, emitEvent } = makeUseCase(TripStatus.COMPLETED);

    await expect(useCase.acceptOffer({ tripId: 'trip-1', driverId: 'driver-1' }))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(tripRepository.updateTripStateAtomic).not.toHaveBeenCalled();
    expect(tripOfferRepository.releaseLock).toHaveBeenCalledWith('trip-1');
    expect(emitEvent).not.toHaveBeenCalled();
  });

  test('rejects a missing trip and releases the distributed lock', async () => {
    const { useCase, tripRepository, tripOfferRepository } = makeUseCase(TripStatus.SEARCHING);
    tripRepository.getTripById.mockResolvedValue(null);

    await expect(useCase.acceptOffer({ tripId: 'trip-1', driverId: 'driver-1' }))
      .rejects.toMatchObject({ statusCode: 404 });

    expect(tripRepository.updateTripStateAtomic).not.toHaveBeenCalled();
    expect(tripOfferRepository.releaseLock).toHaveBeenCalledWith('trip-1');
  });
});

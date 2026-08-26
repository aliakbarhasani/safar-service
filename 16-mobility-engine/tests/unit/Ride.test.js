/**
 * unit/Ride.test.js
 *
 * Unit tests for the Ride domain model's state machine.
 */

const Ride = require('../../domain/models/Ride');
const RideStatus = require('../../domain/enums/RideStatus');
const { InvalidRideStateTransitionError } = require('../../domain/errors/RideErrors');

function makeRide(overrides = {}) {
  return new Ride({
    id: 'ride-1',
    passengerId: 'passenger-1',
    quoteId: 'quote-1',
    origin: { lat: 35.1, lng: 51.1 },
    destination: { lat: 35.2, lng: 51.2 },
    ...overrides,
  });
}

describe('Ride (domain state machine)', () => {
  test('creates a ride with initial status REQUESTED', () => {
    const ride = makeRide();
    expect(ride).toBeInstanceOf(Ride);
    expect(ride.status).toBe(RideStatus.REQUESTED);
    expect(ride.driverId).toBeNull();
    expect(ride.quoteId).toBe('quote-1');
  });

  test('walks through the full happy-path state transitions', () => {
    const ride = makeRide();
    ride.requestDriver();
    expect(ride.status).toBe(RideStatus.SEARCHING);

    ride.accept('driver-1');
    expect(ride.status).toBe(RideStatus.ACCEPTED);
    expect(ride.driverId).toBe('driver-1');

    ride.driverArrived();
    expect(ride.status).toBe(RideStatus.ARRIVED);

    ride.startTrip();
    expect(ride.status).toBe(RideStatus.IN_PROGRESS);

    ride.complete();
    expect(ride.status).toBe(RideStatus.COMPLETED);
  });

  test('throws InvalidRideStateTransitionError jumping REQUESTED -> COMPLETED directly', () => {
    const ride = makeRide();
    let thrown = null;
    try {
      ride.complete();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(InvalidRideStateTransitionError);
    expect(thrown.code).toBe('INVALID_RIDE_STATE_TRANSITION');
  });

  test('accept() requires SEARCHING state', () => {
    const ride = makeRide(); // REQUESTED
    expect(() => ride.accept('driver-1')).toThrow(InvalidRideStateTransitionError);
  });

  test('accept() throws when driverId is missing', () => {
    const ride = makeRide();
    ride.requestDriver(); // -> SEARCHING
    expect(() => ride.accept()).toThrow(/شناسه راننده/);
  });

  test('complete() requires IN_PROGRESS state', () => {
    const ride = makeRide();
    ride.requestDriver();
    ride.accept('d');
    // still ACCEPTED, not IN_PROGRESS
    expect(() => ride.complete()).toThrow(InvalidRideStateTransitionError);
  });

  test('cancel() is allowed from REQUESTED and SEARCHING', () => {
    const fromRequested = makeRide();
    fromRequested.cancel();
    expect(fromRequested.status).toBe(RideStatus.CANCELLED);

    const fromSearching = makeRide();
    fromSearching.requestDriver();
    fromSearching.cancel();
    expect(fromSearching.status).toBe(RideStatus.CANCELLED);
  });

  test('cancel() is not allowed after COMPLETED', () => {
    const ride = makeRide();
    ride.requestDriver();
    ride.accept('d');
    ride.driverArrived();
    ride.startTrip();
    ride.complete();
    expect(() => ride.cancel()).toThrow(InvalidRideStateTransitionError);
  });

  test('status history is recorded for each transition', () => {
    const ride = makeRide();
    ride.requestDriver();
    ride.accept('d');
    expect(ride.statusHistory.length).toBe(2);
    expect(ride.statusHistory[0]).toEqual({ from: 'REQUESTED', to: 'SEARCHING', at: expect.any(Date) });
  });

  test('toDatabaseRecord returns a persistence-ready snapshot', () => {
    const ride = makeRide();
    const rec = ride.toDatabaseRecord();
    expect(rec.passenger_id).toBe('passenger-1');
    expect(rec.quote_id).toBe('quote-1');
    expect(rec.origin_lat).toBe(35.1);
    expect(rec.dest_lng).toBe(51.2);
    expect(rec.status).toBe('REQUESTED');
  });
});
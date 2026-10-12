'use strict';

const TripController = require('../presentation/TripController');

function makeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('TripController passenger identity compatibility', () => {
  test('uses standard JWT sub when userId and id are absent', async () => {
    const createTripUseCase = { execute: jest.fn(async (input) => ({ tripId: 'trip-1', passengerId: input.passengerId })) };
    const controller = new TripController({ createTripUseCase });
    const req = {
      user: { sub: 'passenger-from-jwt', role: 'PASSENGER' },
      body: {
        quoteId: 'quote-1',
        serviceType: 'urban_taxi',
        originLat: 35.7,
        originLng: 51.3,
        destLat: 35.71,
        destLng: 51.31,
      },
    };
    const res = makeResponse();

    await controller.createTrip(req, res);

    expect(res.statusCode).toBe(201);
    expect(createTripUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      passengerId: 'passenger-from-jwt',
      quoteId: 'quote-1',
    }));
  });

  test('does not expose unexpected infrastructure error details to clients', async () => {
    const internalError = new Error('password authentication failed for database user secret_user');
    const createTripUseCase = { execute: jest.fn(async () => { throw internalError; }) };
    const controller = new TripController({ createTripUseCase });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const req = {
      user: { sub: 'passenger-1', role: 'PASSENGER' },
      body: {
        quoteId: 'quote-1',
        serviceType: 'urban_taxi',
        originLat: 35.7,
        originLng: 51.3,
        destLat: 35.71,
        destLng: 51.31,
      },
    };
    const res = makeResponse();

    try {
      await controller.createTrip(req, res);
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('خطای داخلی در ایجاد سفر. لطفاً دوباره تلاش کنید.');
      expect(JSON.stringify(res.body)).not.toContain('password authentication failed');
      expect(JSON.stringify(res.body)).not.toContain('secret_user');
    } finally {
      errorSpy.mockRestore();
    }
  });


  test.each([
    ['acceptTrip', 'acceptTripUseCase', 'خطای داخلی در پذیرش سفر. لطفاً دوباره تلاش کنید.'],
    ['driverArrived', 'arriveAtPickupUseCase', 'خطای داخلی در ثبت رسیدن راننده. لطفاً دوباره تلاش کنید.'],
    ['startTrip', 'startTripUseCase', 'خطای داخلی در شروع سفر. لطفاً دوباره تلاش کنید.'],
    ['completeTrip', 'endTripUseCase', 'خطای داخلی در تکمیل سفر.'],
    ['cancelTrip', 'cancelTripUseCase', 'خطای داخلی در لغو سفر. لطفاً دوباره تلاش کنید.'],
  ])('%s hides unexpected infrastructure error details', async (method, dependency, publicMessage) => {
    const secretMessage = 'connection string password=private-database-secret';
    const useCase = { execute: jest.fn(async () => { throw new Error(secretMessage); }) };
    const controller = new TripController({ [dependency]: useCase });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const req = {
      user: { sub: 'driver-user-1', role: 'driver', driverId: 'driver-1' },
      params: { tripId: 'trip-1' },
      body: {},
    };
    const res = makeResponse();

    try {
      await controller[method](req, res);
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe(publicMessage);
      expect(JSON.stringify(res.body)).not.toContain('connection string');
      expect(JSON.stringify(res.body)).not.toContain('private-database-secret');
    } finally {
      errorSpy.mockRestore();
    }
  });

});

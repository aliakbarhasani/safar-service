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
});

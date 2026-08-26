const request = require('supertest');

describe('Trip Management Endpoint & Lifecycle Integration Tests', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('GET /health - Success', async () => {
    const app = require('../../run-server');

    const res = await request(app)
      .get('/health')
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('status', 'UP');
  });

  test('POST /api/v1/trips - Success', async () => {
    const app = require('../../run-server');

    const payload = {
      riderId: 'rider-123',
      origin: 'Point A',
      destination: 'Point B',
      demandFactor: 1.0,
    };

    const res = await request(app)
      .post('/api/v1/trips')
      .send(payload)
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('status_code', 201);
    expect(res.body).toHaveProperty('data');
    expect(typeof res.body.data).toBe('object');
    expect(res.body.data).toHaveProperty('status');
  });

  test('POST /api/v1/trips - Invalid Payload', async () => {
    jest.resetModules();

    // Mock CreateTrip to throw so the controller returns 400
    jest.mock('../../core/use-cases/CreateTrip', () => {
      return class MockCreateTrip {
        constructor() {}
        async execute() {
          throw new Error('Invalid payload');
        }
      };
    });

    const app = require('../../run-server');

    const res = await request(app)
      .post('/api/v1/trips')
      .send({})
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('status_code', 400);
  });

  test('GET /does-not-exist - Returns standardized error shape', async () => {
    const app = require('../../run-server');

    const res = await request(app)
      .get('/does-not-exist')
      .set('Accept', 'application/json');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('status', 404);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message');
  });

  test('Trip State Machine Integration', async () => {
    const UpdateTripStatus = require('../../core/use-cases/UpdateTripStatus');
    const TripStateMachine = require('../../core/domain/TripStateMachine');

    // Simple in-memory repository with required methods
    const repo = {
      trips: new Map(),
      async getById(id) {
        return this.trips.get(id);
      },
      async save(trip) {
        this.trips.set(trip.id, trip);
        return trip;
      },
    };

    const tripId = 'test-trip-1';
    const initial = { id: tripId, status: TripStateMachine.STATUS.PENDING_DRIVER };
    await repo.save(initial);

    const useCase = new UpdateTripStatus(repo);

    // valid transition PENDING_DRIVER -> ACCEPTED
    const updated = await useCase.execute(tripId, TripStateMachine.STATUS.ACCEPTED);
    expect(updated).toHaveProperty('status', TripStateMachine.STATUS.ACCEPTED);

    // invalid transition PENDING_DRIVER (now ACCEPTED) -> COMPLETED should throw
    await expect(useCase.execute(tripId, TripStateMachine.STATUS.COMPLETED)).rejects.toThrow(
      /Invalid status transition/
    );
  });
});

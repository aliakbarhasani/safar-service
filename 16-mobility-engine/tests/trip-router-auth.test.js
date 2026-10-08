'use strict';

const express = require('express');
const request = require('supertest');
const createTripRouter = require('../presentation/TripRouter');
const { authorize } = require('../../02-api-gateway/middlewares/authorize.middleware');

function buildApp(role) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 'user-1', userId: 'user-1', role };
    next();
  });

  const tripController = {
    createTrip: jest.fn((req, res) => res.status(201).json({ success: true })),
    acceptTrip: jest.fn((req, res) => res.status(200).json({ success: true })),
    driverArrived: jest.fn((req, res) => res.status(200).json({ success: true })),
    startTrip: jest.fn((req, res) => res.status(200).json({ success: true })),
    completeTrip: jest.fn((req, res) => res.status(200).json({ success: true })),
    cancelTrip: jest.fn((req, res) => res.status(200).json({ success: true })),
  };

  app.use('/', createTripRouter(tripController, authorize));
  return { app, tripController };
}

describe('TripRouter create-trip authorization', () => {
  test('denies a driver who does not have trip:create', async () => {
    const { app, tripController } = buildApp('DRIVER');
    const response = await request(app).post('/').send({});

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(tripController.createTrip).not.toHaveBeenCalled();
  });

  test('allows a passenger with trip:create', async () => {
    const { app, tripController } = buildApp('PASSENGER');
    const response = await request(app).post('/').send({});

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(tripController.createTrip).toHaveBeenCalledTimes(1);
  });
});

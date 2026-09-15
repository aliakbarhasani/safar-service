'use strict';

/**
 * dispatch-routes.test.js - Mobility Engine (P13-2)
 *
 * تست روت `POST /api/v1/dispatch/trips/:tripId/accept` با:
 *   - `iamAuthenticate` واقعی (وریفای RS256 با public.pem) و توکنهای واقعی IAM
 *   - الزام نقش DRIVER → 403 برای مسافر
 *   - نگاشت خطاها به کدهای HTTP (200/400/401/403/404/409)
 *   - استخراج driverId از توکن (نه از بادی) → ضد جعل هویت
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { createDispatchRoutes, requireDriverRole, isDriver } = require('../routes/dispatch.routes');
const { authenticate: iamAuthenticate } = require('../../02-api-gateway/middlewares/auth.middleware');

const PRIVATE_KEY = fs.readFileSync(
  path.join(__dirname, '..', '..', '24-iam-service', 'infrastructure', 'keys', 'private.pem'),
  'utf8',
);

function issueToken({ sub, role }) {
  return jwt.sign({ sub, role }, PRIVATE_KEY, { algorithm: 'RS256', issuer: 'safar-iam', expiresIn: '5m' });
}

const ACCEPTED = {
  tripId: 'trip-1',
  status: 'ACCEPTED',
  driverId: 'drv-7',
  passengerId: 'psg-1',
  offerStatus: 'PENDING',
};

function makeApp(useCase) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/dispatch', createDispatchRoutes({
    acceptTripUseCase: useCase,
    iamAuthenticate,
    logger: { error: () => {} },
  }));
  return app;
}

function acceptCall(app, token) {
  const req = request(app).post('/api/v1/dispatch/trips/trip-1/accept').send({ driverId: 'spoofed-id' });
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

describe('P13-2: POST /api/v1/dispatch/trips/:tripId/accept', () => {
  test('DRIVER token → 200 and driverId comes from the token, not the body', async () => {
    const useCase = { acceptOffer: jest.fn().mockResolvedValue(ACCEPTED) };
    const res = await acceptCall(makeApp(useCase), issueToken({ sub: 'drv-7', role: 'DRIVER' }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { tripId: 'trip-1', status: 'ACCEPTED' } });
    expect(useCase.acceptOffer).toHaveBeenCalledWith({
      tripId: 'trip-1',
      driverId: 'drv-7', // از توکن — بدی نادیده گرفته شد
      changedByUserId: 'drv-7',
    });
  });

  test('PASSENGER token → 403 without touching the use case', async () => {
    const useCase = { acceptOffer: jest.fn() };
    const res = await acceptCall(makeApp(useCase), issueToken({ sub: 'psg-1', role: 'PASSENGER' }));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/DRIVER role required/);
    expect(useCase.acceptOffer).not.toHaveBeenCalled();
  });

  test('missing or tampered token → 401', async () => {
    const useCase = { acceptOffer: jest.fn() };
    const app = makeApp(useCase);
    const driverToken = issueToken({ sub: 'drv-7', role: 'DRIVER' });

    expect((await acceptCall(app, null)).status).toBe(401);
    expect((await acceptCall(app, `${driverToken}x`)).status).toBe(401);
    expect(useCase.acceptOffer).not.toHaveBeenCalled();
  });

  test('maps domain errors to HTTP codes (400/403/404/409/500)', async () => {
    const cases = [
      { statusCode: 400, code: 'ACCEPT_TRIP_VALIDATION' },
      { statusCode: 403, code: 'UNAUTHORIZED_DISPATCH' },   // آفر منقضی
      { statusCode: 404, code: 'RIDE_NOT_FOUND' },
      { statusCode: 409, code: 'TRIP_ALREADY_ACCEPTED' },   // قفل در اختیار راننده دیگر
    ];

    for (const { statusCode, code } of cases) {
      const error = Object.assign(new Error(`err-${code}`), { statusCode, code });
      const useCase = { acceptOffer: jest.fn().mockRejectedValue(error) };
      const res = await acceptCall(makeApp(useCase), issueToken({ sub: 'drv-7', role: 'DRIVER' }));

      expect(res.status).toBe(statusCode);
      expect(res.body).toMatchObject({ success: false, error: `err-${code}`, code });
    }

    // خطای بدون statusCode → 500
    const useCase = { acceptOffer: jest.fn().mockRejectedValue(new Error('boom')) };
    const res = await acceptCall(makeApp(useCase), issueToken({ sub: 'drv-7', role: 'DRIVER' }));
    expect(res.status).toBe(500);
  });

  test('factory and role guard validate their inputs', () => {
    expect(() => createDispatchRoutes({ iamAuthenticate })).toThrow(/acceptTripUseCase/);
    expect(() => createDispatchRoutes({ acceptTripUseCase: { execute: () => {} }, iamAuthenticate }))
      .toThrow(/acceptOffer/);
    expect(() => createDispatchRoutes({ acceptTripUseCase: { acceptOffer: () => {} } }))
      .toThrow(/iamAuthenticate/);

    // requireDriverRole: بدون کاربر → 401
    const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(b) { this.body = b; return this; } };
    requireDriverRole({ headers: {} }, res, () => { throw new Error('next should not be called'); });
    expect(res.statusCode).toBe(401);

    expect(isDriver({ user: { role: 'driver' } })).toBe(true);
    expect(isDriver({ user: { role: 'SUPER_ADMIN' } })).toBe(true);
    expect(isDriver({ user: { role: 'PASSENGER' } })).toBe(false);
  });
});
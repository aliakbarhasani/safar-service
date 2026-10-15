'use strict';

const express = require('express');
const request = require('supertest');
const { createAuthRoutes } = require('../routes/auth.routes');

describe('IAM login route security boundary', () => {
  test('fails closed when caller supplies an arbitrary privileged identity', async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'must-not-be-issued',
        refreshToken: 'must-not-be-issued',
      }),
      refreshToken: jest.fn(),
    };
    const logger = { error: jest.fn() };
    const app = express();
    app.use(express.json());
    app.use('/auth', createAuthRoutes({ authService, logger }));

    const response = await request(app)
      .post('/auth/login')
      .send({
        userId: 'attacker-controlled-user',
        role: 'admin',
        password: 'unverified-password',
      });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: 'AUTHENTICATION_NOT_CONFIGURED',
    });
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(authService.login).not.toHaveBeenCalled();
  });
});

describe('IAM refresh route error disclosure boundary', () => {
  function makeApp(refreshToken) {
    const authService = { refreshToken };
    const logger = { error: jest.fn() };
    const app = express();
    app.use(express.json());
    app.use('/auth', createAuthRoutes({ authService, logger }));
    return { app, logger };
  }

  test('returns a safe client error for an invalid refresh token', async () => {
    const { app } = makeApp(jest.fn().mockRejectedValue(Object.assign(
      new Error('private Redis key details must not be returned'),
      { code: 'INVALID_REFRESH_TOKEN', statusCode: 401 },
    )));

    const response = await request(app).post('/auth/refresh').send({ refreshToken: 'bad-token' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: 'INVALID_REFRESH_TOKEN',
      message: 'The refresh token is invalid or expired.',
    });
    expect(JSON.stringify(response.body)).not.toContain('private Redis key details');
  });

  test('hides unexpected infrastructure errors and returns 500', async () => {
    const { app } = makeApp(jest.fn().mockRejectedValue(new Error('database password leaked here')));

    const response = await request(app).post('/auth/refresh').send({ refreshToken: 'some-token' });

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      error: 'AUTH_REFRESH_FAILED',
      message: 'Unable to refresh the session.',
    });
    expect(JSON.stringify(response.body)).not.toContain('database password');
  });

  test('reports unavailable token storage without exposing its internal reason', async () => {
    const { app } = makeApp(jest.fn().mockRejectedValue(Object.assign(
      new Error('redis cluster node 10.0.0.4 is unavailable'),
      { code: 'REFRESH_TOKEN_STORAGE_UNAVAILABLE', statusCode: 503 },
    )));

    const response = await request(app).post('/auth/refresh').send({ refreshToken: 'some-token' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: 'REFRESH_TOKEN_STORAGE_UNAVAILABLE',
      message: 'Session refresh is temporarily unavailable.',
    });
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.4');
  });

  test('requires a refresh token with a safe validation response', async () => {
    const { app } = makeApp(jest.fn().mockRejectedValue(Object.assign(
      new Error('refreshToken is required'),
      { code: 'MISSING_REFRESH_TOKEN', statusCode: 400 },
    )));

    const response = await request(app).post('/auth/refresh').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('MISSING_REFRESH_TOKEN');
  });
});

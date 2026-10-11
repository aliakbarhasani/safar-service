'use strict';

const express = require('express');
const request = require('supertest');
const { createAuthRoutes } = require('../routes/auth.routes');

describe('IAM login route security boundary', () => {
  let app;
  let authService;
  let logger;

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'must-not-be-issued',
        refreshToken: 'must-not-be-issued',
      }),
      refreshToken: jest.fn(),
    };
    logger = { error: jest.fn() };
    app = express();
    app.use(express.json());
    app.use('/auth', createAuthRoutes({ authService, logger }));
  });

  test('fails closed even when the caller supplies a privileged userId and role', async () => {
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

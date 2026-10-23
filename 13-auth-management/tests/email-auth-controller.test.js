const EmailAuthController = require('../presentation/controllers/EmailAuthController');

describe('email auth controller', () => {
  const makeResponse = () => {
    const res = {
      cookie: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sets access token only in an HttpOnly cookie, not in the JSON body', async () => {
    const loginUseCase = {
      execute: jest.fn().mockResolvedValue({
        accessToken: 'secret-access-token',
        sessionId: 'session-1',
        user: { id: 'user-1', email: 'person@example.com', isEmailVerified: false },
      }),
    };
    const controller = new EmailAuthController(loginUseCase);
    const req = {
      body: { email: 'person@example.com', password: 'correct-password' },
      headers: { 'user-agent': 'test-agent' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = makeResponse();

    await controller.login(req, res);

    expect(res.cookie).toHaveBeenCalledWith('access_token', 'secret-access-token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.user.email).toBe('person@example.com');
    expect(JSON.stringify(body)).not.toContain('secret-access-token');
  });

  test('does not set a cookie when authentication fails', async () => {
    const loginUseCase = {
      execute: jest.fn().mockRejectedValue(Object.assign(new Error('Invalid email or password'), { statusCode: 401 })),
    };
    const controller = new EmailAuthController(loginUseCase);
    const req = { body: { email: 'person@example.com', password: 'wrong-password' }, headers: {}, socket: {} };
    const res = makeResponse();

    await controller.login(req, res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('Invalid email or password');
  });

  test('returns service unavailable when session storage is down', async () => {
    const loginUseCase = {
      execute: jest.fn().mockRejectedValue(Object.assign(new Error('Session store unavailable'), { statusCode: 503 })),
    };
    const controller = new EmailAuthController(loginUseCase);
    const req = { body: { email: 'person@example.com', password: 'correct-password' }, headers: {}, socket: {} };
    const res = makeResponse();

    await controller.login(req, res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

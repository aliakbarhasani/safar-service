const bcrypt = require('bcryptjs');
const EmailPasswordLoginUseCase = require('../application/use-cases/EmailPasswordLoginUseCase');

describe('email/password login', () => {
  const activeUser = {
    id: 'user-1',
    email: 'person@example.com',
    phone_number: null,
    first_name: 'Ali',
    last_name: 'Hasani',
    role: 'passenger',
    status: 'active',
    password_hash: 'stored-hash',
    is_email_verified: false,
  };

  let userRepository;
  let sessionManager;
  let useCase;
  let compareSpy;

  beforeEach(() => {
    userRepository = { findByEmail: jest.fn().mockResolvedValue({ ...activeUser }) };
    sessionManager = {
      createSession: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        sessionId: 'session-1',
      }),
    };
    useCase = new EmailPasswordLoginUseCase({ userRepository, sessionManager });
    compareSpy = jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
  });

  afterEach(() => {
    compareSpy.mockRestore();
  });

  test('normalizes email and creates a session for a valid password', async () => {
    const result = await useCase.execute(' Person@Example.COM ', 'correct-password');

    expect(userRepository.findByEmail).toHaveBeenCalledWith('person@example.com');
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'person@example.com', role: 'passenger' }),
      {}
    );
    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('access-token');
    expect(result.user.isEmailVerified).toBe(false);
  });

  test('returns the same authentication error for an unknown email and wrong password', async () => {
    compareSpy.mockResolvedValue(false);

    await expect(useCase.execute('person@example.com', 'wrong-password'))
      .rejects.toMatchObject({ statusCode: 401, message: 'Invalid email or password' });

    userRepository.findByEmail.mockResolvedValue(null);
    await expect(useCase.execute('missing@example.com', 'wrong-password'))
      .rejects.toMatchObject({ statusCode: 401, message: 'Invalid email or password' });
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  test('rejects inactive accounts without creating a session', async () => {
    userRepository.findByEmail.mockResolvedValue({ ...activeUser, status: 'blocked' });

    await expect(useCase.execute('person@example.com', 'correct-password'))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(sessionManager.createSession).not.toHaveBeenCalled();
  });

  test('fails closed when session storage is unavailable', async () => {
    sessionManager.createSession.mockRejectedValue(new Error('database unavailable'));

    await expect(useCase.execute('person@example.com', 'correct-password'))
      .rejects.toMatchObject({ statusCode: 503, code: 'AUTH_SESSION_UNAVAILABLE' });
  });
});

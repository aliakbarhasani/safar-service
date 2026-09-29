const bcrypt = require('bcryptjs');
const VerifyOtpUseCase = require('../application/use-cases/VerifyOtpUseCase');

describe('VerifyOtpUseCase - session failure safety', () => {
  test('does not return a JWT when session creation fails', async () => {
    const phoneNumber = '09120000001';

    const otpRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue({
        codeHash: bcrypt.hashSync('123456', 4),
        isUsed: false,
        attempts: 0,
        maxAttempts: 5,
        isExpired: () => false,
      }),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };

    const userRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000001',
        phone_number: phoneNumber,
        first_name: 'User',
        last_name: 'Test',
        email: null,
        role: 'passenger',
        status: 'active',
      }),
    };

    const sessionManager = {
      createSession: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };

    const useCase = new VerifyOtpUseCase({
      otpRepository,
      userRepository,
      jwtService: { generateAccessToken: jest.fn() },
      sessionManager,
    });

    await expect(
      useCase.execute(phoneNumber, '123456', 'login')
    ).rejects.toMatchObject({
      code: 'AUTH_SESSION_UNAVAILABLE',
    });
  });
});

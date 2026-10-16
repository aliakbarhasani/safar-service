const bcrypt = require('bcryptjs');
const { normalizePhoneNumber, getPhoneNumberLookupCandidates } = require('../domain/services/PhoneNumber');
const UserRepository = require('../infrastructure/repositories/UserRepository');
const RequestOtpUseCase = require('../application/use-cases/RequestOtpUseCase');
const VerifyOtpUseCase = require('../application/use-cases/VerifyOtpUseCase');
const RegisterUserUseCase = require('../application/use-cases/RegisterUserUseCase');

describe('Phone number canonicalization', () => {
  test.each([
    ['Iran national', '09123456789', '09123456789'],
    ['Iran without national zero', '9123456789', '09123456789'],
    ['Iran international', '00989123456789', '09123456789'],
    ['Iran international without plus', '989123456789', '09123456789'],
    ['Afghanistan national', '0701234567', '0701234567'],
    ['Afghanistan without national zero', '701234567', '0701234567'],
    ['Afghanistan international', '0093701234567', '0701234567'],
    ['Afghanistan international without plus', '93701234567', '0701234567'],
    ['Persian digits and separators', ' ۰۷۰-۱۲۳۴۵۶۷ ', '0701234567'],
    ['generic E.164', '+14155552671', '+14155552671'],
  ])('normalizes %s', (_label, input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  test.each(['', '1234567890', '09123', '+00123456789', '09ABC456789', '  '])(
    'rejects invalid phone input %s',
    (input) => {
      expect(normalizePhoneNumber(input)).toBeNull();
    },
  );
});

describe('legacy account lookup compatibility', () => {
  test('canonical Iranian number includes the previous stored formats', () => {
    expect(getPhoneNumberLookupCandidates('+989123456789')).toEqual([
      '09123456789',
      '9123456789',
      '+989123456789',
      '989123456789',
      '00989123456789',
    ]);
  });

  test('UserRepository queries canonical and legacy formats together', async () => {
    const repository = new UserRepository();
    const legacyUser = {
      id: 'legacy-user',
      phone_number: '+989123456789',
      first_name: 'Legacy',
      last_name: 'User',
      role: 'passenger',
      status: 'active',
    };
    repository.pool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [legacyUser] }),
      end: jest.fn(),
    };

    await expect(repository.findByPhoneNumber('09123456789')).resolves.toEqual(legacyUser);
    expect(repository.pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('phone_number = ANY($1::text[])'),
      [['09123456789', '9123456789', '+989123456789', '989123456789', '00989123456789']],
    );
  });
});

describe('OTP use cases use canonical phone numbers', () => {
  test('request validates and stores/sends OTP to canonical Afghan number', async () => {
    const otpRepository = { save: jest.fn().mockResolvedValue({}) };
    const smsProvider = { send: jest.fn().mockResolvedValue({}) };
    const useCase = new RequestOtpUseCase({ otpRepository, smsProvider });

    const result = await useCase.execute('0701234567');

    expect(result.phoneNumber).toBe('0701234567');
    expect(otpRepository.save).toHaveBeenCalledWith(
      '0701234567',
      expect.any(String),
      expect.any(String),
      'login',
    );
    expect(smsProvider.send).toHaveBeenCalledWith('0701234567', expect.stringContaining('OTP code is:'));
  });

  test('request rejects invalid input before saving or sending OTP', async () => {
    const otpRepository = { save: jest.fn() };
    const smsProvider = { send: jest.fn() };
    const useCase = new RequestOtpUseCase({ otpRepository, smsProvider });

    await expect(useCase.execute('1234567890')).rejects.toMatchObject({
      code: 'INVALID_PHONE_NUMBER',
      statusCode: 400,
    });
    expect(otpRepository.save).not.toHaveBeenCalled();
    expect(smsProvider.send).not.toHaveBeenCalled();
  });

  test('verification looks up OTP and user using the same canonical Afghan number', async () => {
    const phone = '0701234567';
    const otpRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue({
        codeHash: bcrypt.hashSync('12345', 4),
        isUsed: false,
        attempts: 0,
        maxAttempts: 5,
        isExpired: () => false,
      }),
      markUsed: jest.fn().mockResolvedValue({ accepted: true }),
      delete: jest.fn(),
      incrementAttempt: jest.fn(),
    };
    const userRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue({
        id: 'user-1',
        phone_number: phone,
        first_name: 'Test',
        last_name: 'User',
        email: null,
        role: 'passenger',
        status: 'active',
      }),
    };
    const sessionManager = {
      createSession: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionId: 'session-1',
      }),
    };
    const useCase = new VerifyOtpUseCase({ otpRepository, userRepository, sessionManager });

    const result = await useCase.execute('0701234567', '12345');

    expect(otpRepository.findByPhoneNumber).toHaveBeenCalledWith(phone, 'login');
    expect(otpRepository.markUsed).toHaveBeenCalledWith(phone, 'login');
    expect(userRepository.findByPhoneNumber).toHaveBeenCalledWith(phone);
    expect(result.user.phoneNumber).toBe(phone);
  });

  test('verification rejects invalid phone input before reading OTP storage', async () => {
    const otpRepository = { findByPhoneNumber: jest.fn() };
    const useCase = new VerifyOtpUseCase({ otpRepository });

    await expect(useCase.execute('1234567890', '12345')).rejects.toMatchObject({
      code: 'INVALID_PHONE_NUMBER',
      statusCode: 400,
    });
    expect(otpRepository.findByPhoneNumber).not.toHaveBeenCalled();
  });

  test('registration stores normalized Iranian number to prevent format duplicates', async () => {
    const userRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'user-2',
        phone_number: '09123456789',
        first_name: 'Ali',
        last_name: 'Hasani',
        email: null,
        role: 'passenger',
        status: 'active',
        created_at: new Date().toISOString(),
      }),
    };
    const useCase = new RegisterUserUseCase(userRepository);

    await useCase.execute({
      phoneNumber: '09123456789',
      firstName: 'Ali',
      lastName: 'Hasani',
      password: 'test-password',
    });

    expect(userRepository.findByPhoneNumber).toHaveBeenCalledWith('09123456789');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: '09123456789' }),
    );
  });
});

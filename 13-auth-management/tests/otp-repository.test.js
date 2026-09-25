/**
 * Unit tests for OtpRepository (in-memory fallback path) + the verify flow.
 *
 * Regression coverage for the `ReferenceError: key` that markUsed() used to
 * throw in its in-memory branch, and for "an OTP cannot be reused after
 * markUsed".
 *
 * The PostgreSQL branch is intentionally exercised only through its contract:
 * these tests force the in-memory path (`repo.pool = null` -> _isDBReady()
 * returns false) so they stay deterministic without a live database.
 */
const bcrypt = require('bcryptjs');

const OtpRepository = require('../infrastructure/repositories/OtpRepository');
const VerifyOtpUseCase = require('../application/use-cases/VerifyOtpUseCase');

const PHONE = '09120000001';
const FUTURE = new Date(Date.now() + 5 * 60 * 1000).toISOString();

// One-time low-cost hashes so every test stays well within Jest's timeout.
const HASHES = {
  '123456': bcrypt.hashSync('123456', 4),
  '111111': bcrypt.hashSync('111111', 4),
  '222222': bcrypt.hashSync('222222', 4),
  '424242': bcrypt.hashSync('424242', 4),
  '654321': bcrypt.hashSync('654321', 4),
};

/** Builds an OtpRepository pinned to its in-memory fallback. */
function buildInMemoryRepo() {
  const repo = new OtpRepository();
  repo.pool = null; // _isDBReady() -> false, no PG connection attempts/handles
  return repo;
}


describe('OtpRepository (in-memory fallback)', () => {
  test('markUsed does not throw ReferenceError: key and marks the OTP as used', async () => {
        const repo = buildInMemoryRepo();
    await repo.save(PHONE, HASHES['123456'], FUTURE, 'login');

    // Before the fix this line crashed with `ReferenceError: key is not defined`.
    await expect(repo.markUsed(PHONE, 'login')).resolves.not.toThrow();

    const entry = await repo.findByPhoneNumber(PHONE, 'login');
    expect(entry).not.toBeNull();
    expect(entry.isUsed).toBe(true);
  });

  test('markUsed only affects the matching phoneNumber:type key', async () => {
    const repo = buildInMemoryRepo();
        await repo.save(PHONE, HASHES['111111'], FUTURE, 'login');
    await repo.save(PHONE, HASHES['222222'], FUTURE, 'reset_password');

    await repo.markUsed(PHONE, 'login');

    expect((await repo.findByPhoneNumber(PHONE, 'login')).isUsed).toBe(true);
    expect((await repo.findByPhoneNumber(PHONE, 'reset_password')).isUsed).toBe(false);
  });

  test('markUsed for an unknown OTP is a graceful no-op (no throw, no entry created)', async () => {
    const repo = buildInMemoryRepo();

    await expect(repo.markUsed('09999999999', 'login')).resolves.not.toThrow();
    expect(await repo.findByPhoneNumber('09999999999', 'login')).toBeNull();
  });

  test('save/find round-trip keeps the entry verifiable before markUsed', async () => {
    const repo = buildInMemoryRepo();
    const plain = '654321';
        await repo.save(PHONE, HASHES['654321'], FUTURE, 'login');

    const entry = await repo.findByPhoneNumber(PHONE, 'login');
    expect(entry.isUsed).toBe(false);
    expect(await bcrypt.compare(plain, entry.codeHash)).toBe(true);
    expect(entry.isValid().isValid).toBe(true);
  });
});

describe('VerifyOtpUseCase - OTP is not reusable after markUsed', () => {
  function buildUseCase(repo) {
    const userRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 42,
        phone_number: PHONE,
        first_name: 'User',
        last_name: '000001',
        email: null,
        role: 'passenger',
        status: 'active',
      }),
    };
    const jwtService = {
      generateAccessToken: jest.fn().mockReturnValue('bare-access-token'),
    };
    const sessionManager = {
      createSession: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionId: 'session-1',
      }),
    };

    return {
      useCase: new VerifyOtpUseCase({ otpRepository: repo, userRepository, jwtService, sessionManager }),
      userRepository,
    };
  }

    test('first verify succeeds; second verify of the same OTP is rejected as already used', async () => {
    const repo = buildInMemoryRepo();
    await repo.save(PHONE, HASHES['424242'], FUTURE, 'login');

    const { useCase, userRepository } = buildUseCase(repo);

    const first = await useCase.execute(PHONE, '424242', 'login');
    expect(first.success).toBe(true);
    expect(userRepository.create).toHaveBeenCalledTimes(1);

    // The OTP was marked used by the first verify -> second use must fail.
    await expect(useCase.execute(PHONE, '424242', 'login')).rejects.toThrow(
      'OTP has already been used. Please request a new one.',
    );
    // No second user creation for the already-used OTP.
    expect(userRepository.create).toHaveBeenCalledTimes(1);
  });

  test('verify with a wrong code fails and does not mark the OTP as used', async () => {
    const repo = buildInMemoryRepo();
        await repo.save(PHONE, HASHES['424242'], FUTURE, 'login');

        const useCase = buildUseCase(repo).useCase;

    await expect(useCase.execute(PHONE, '000000', 'login')).rejects.toThrow('Invalid OTP');
    expect((await repo.findByPhoneNumber(PHONE, 'login')).isUsed).toBe(false);
  });
});

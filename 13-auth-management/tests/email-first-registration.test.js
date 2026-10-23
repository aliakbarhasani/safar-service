const RegisterUserUseCase = require('../application/use-cases/RegisterUserUseCase');
const User = require('../domain/entities/User');

describe('email-first registration', () => {
  const makeRepository = () => ({
    findByEmail: jest.fn().mockResolvedValue(null),
    findByPhoneNumber: jest.fn().mockResolvedValue(null),
    create: jest.fn(async (data) => ({
      id: 'user-1',
      phone_number: data.phoneNumber,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      role: data.role,
      status: data.status,
      created_at: '2026-10-22T00:00:00.000Z',
    })),
  });

  test('domain accepts an email-only account', () => {
    const user = new User({
      email: 'person@example.com',
      firstName: 'Ali',
      lastName: 'Hasani',
      passwordHash: 'hashed-password',
    });
    expect(user.isValid().isValid).toBe(true);
  });

  test('registration normalizes email and does not require a phone number', async () => {
    const repository = makeRepository();
    const useCase = new RegisterUserUseCase(repository);
    useCase.bcrypt = { hash: jest.fn().mockResolvedValue('hashed-password') };

    const result = await useCase.execute({
      email: ' Person@Example.COM ',
      firstName: 'Ali',
      lastName: 'Hasani',
      password: 'a-long-enough-password',
    });

    expect(repository.findByEmail).toHaveBeenCalledWith('person@example.com');
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'person@example.com',
      phoneNumber: null,
      role: 'passenger',
      isEmailVerified: false,
    }));
    expect(result.success).toBe(true);
  });

  test('rejects duplicate normalized email', async () => {
    const repository = makeRepository();
    repository.findByEmail.mockResolvedValue({ id: 'existing' });
    const useCase = new RegisterUserUseCase(repository);
    useCase.bcrypt = { hash: jest.fn() };

    await expect(useCase.execute({
      email: 'PERSON@example.com',
      firstName: 'Ali',
      lastName: 'Hasani',
      password: 'a-long-enough-password',
    })).rejects.toThrow('An account with this email already exists');
    expect(useCase.bcrypt.hash).not.toHaveBeenCalled();
  });

  test('never permits self-assigned administrator roles', async () => {
    const useCase = new RegisterUserUseCase(makeRepository());
    await expect(useCase.execute({
      email: 'person@example.com',
      firstName: 'Ali',
      lastName: 'Hasani',
      password: 'a-long-enough-password',
      role: 'admin',
    })).rejects.toThrow('Admin roles cannot be self-assigned');
  });
});

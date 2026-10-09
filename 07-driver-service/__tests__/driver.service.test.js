/**
 * driver.service.test.js - Unit tests for the Driver service (PostgreSQL Repo injected)
 *
 * Runs the business rules without a live database by injecting a fake
 * DriverRepository (Clean Architecture / DIP).
 */

const { createDriverService } = require('../services/driver.service');

function fakeRepo(overrides = {}) {
  return {
    findByPhoneNumber: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateAccountStatus: jest.fn(),
    updateOperationalStatus: jest.fn(),
    updateLocation: jest.fn(),
    findAll: jest.fn(),
    ...overrides,
  };
}

const BASE_DRIVER = {
  id: 'd-1',
  accountStatus: 'pending_verification',
  operationalStatus: 'offline',
  licenseExpiryDate: null,
  insuranceExpiryDate: null,
  registrationExpiryDate: null,
};

describe('DriverService', () => {
  test('registerDriver requires userId (drivers.user_id FK)', async () => {
    const svc = createDriverService(fakeRepo());
    const res = await svc.registerDriver({ firstName: 'A', lastName: 'B', phoneNumber: '989' });
    expect(res.error).toMatch(/userId is required/);
  });

  test('registerDriver rejects duplicate phone number', async () => {
    const repo = fakeRepo();
    repo.findByPhoneNumber.mockResolvedValue({ id: 'existing' });
    const svc = createDriverService(repo);
    const res = await svc.registerDriver({ userId: 'u1', firstName: 'A', lastName: 'B', phoneNumber: '989' });
    expect(res.error).toMatch(/already exists/);
  });

  test('registerDriver creates a driver via repository', async () => {
    const repo = fakeRepo();
    repo.findByPhoneNumber.mockResolvedValue(null);
    const created = { id: 'd-9', accountStatus: 'pending_verification' };
    repo.create.mockResolvedValue(created);
    const svc = createDriverService(repo);
    const res = await svc.registerDriver({ userId: 'u1', firstName: 'Ali', lastName: 'B', phoneNumber: '989' });
    expect(res).toEqual(created);
    expect(repo.create).toHaveBeenCalled();
    const arg = repo.create.mock.calls[0][0];
    expect(arg.userId).toBe('u1');
    expect(arg.accountStatus).toBeUndefined(); // status is a DB default
  });

  test('updateDriverAccountStatus rejects invalid status', async () => {
    const svc = createDriverService(fakeRepo());
    const res = await svc.updateDriverAccountStatus('d1', 'not-a-status', 'admin');
    expect(res.error).toMatch(/Invalid driver account status/);
  });

  test('updateDriverAccountStatus returns not-found', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue(null);
    const svc = createDriverService(repo);
    const res = await svc.updateDriverAccountStatus('nope', 'verified', 'admin');
    expect(res.error).toMatch(/Driver not found/);
  });

  test('updateDriverAccountStatus updates and returns driver', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue({ ...BASE_DRIVER, accountStatus: 'pending_verification' });
    repo.updateAccountStatus.mockResolvedValue({ ...BASE_DRIVER, accountStatus: 'verified' });
    const svc = createDriverService(repo);
    const res = await svc.updateDriverAccountStatus('d1', 'verified', 'admin');
    expect(res.accountStatus).toBe('verified');
    expect(repo.updateAccountStatus).toHaveBeenCalledWith('d1', 'verified');
  });

  test('go-online requires verified account', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue({ ...BASE_DRIVER, accountStatus: 'pending_verification' });
    const svc = createDriverService(repo);
    const res = await svc.updateOperationalStatus('d1', 'online');
    expect(res.error).toMatch(/must be verified/);
  });

  test('go-online rejects expired license', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue({
      ...BASE_DRIVER,
      accountStatus: 'verified',
      licenseExpiryDate: '2000-01-01',
    });
    const svc = createDriverService(repo);
    const res = await svc.updateOperationalStatus('d1', 'online');
    expect(res.error).toMatch(/license has expired/);
  });

  test('go-online succeeds for verified driver without expired docs', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue({ ...BASE_DRIVER, accountStatus: 'verified' });
    repo.updateOperationalStatus.mockResolvedValue({ ...BASE_DRIVER, accountStatus: 'verified', operationalStatus: 'online' });
    const svc = createDriverService(repo);
    const res = await svc.updateOperationalStatus('d1', 'online');
    expect(res.error).toBeUndefined();
    expect(repo.updateOperationalStatus).toHaveBeenCalled();
    const [, status, opts] = repo.updateOperationalStatus.mock.calls[0];
    expect(status).toBe('online');
    expect(opts.lastSeenAt).toBeDefined();
  });

  test('updateLocation requires coordinates', async () => {
    const svc = createDriverService(fakeRepo());
    const res = await svc.updateLocation('d1', null, 10);
    expect(res.error).toMatch(/latitude.*longitude/);
  });

  test('updateLocation rejects coordinates outside geographic bounds', async () => {
    const repo = fakeRepo();
    const svc = createDriverService(repo);
    expect((await svc.updateLocation('d1', 91, 10)).error).toMatch(/Valid latitude/);
    expect((await svc.updateLocation('d1', 10, 181)).error).toMatch(/Valid latitude/);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.updateLocation).not.toHaveBeenCalled();
  });

  test('updateLocation normalizes valid numeric strings before persistence', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue(BASE_DRIVER);
    repo.updateLocation.mockResolvedValue({ ...BASE_DRIVER, currentLocation: { latitude: 35.7, longitude: 51.4 } });
    const svc = createDriverService(repo);
    await svc.updateLocation('d1', '35.7', '51.4');
    expect(repo.updateLocation).toHaveBeenCalledWith('d1', 35.7, 51.4);
  });

  test('updateLocation returns not-found', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue(null);
    const svc = createDriverService(repo);
    const res = await svc.updateLocation('nope', 1, 2);
    expect(res.error).toMatch(/Driver not found/);
  });

  test('getDriverById and getAllDrivers delegate to repository', async () => {
    const repo = fakeRepo();
    repo.findById.mockResolvedValue(BASE_DRIVER);
    repo.findAll.mockResolvedValue([BASE_DRIVER]);
    const svc = createDriverService(repo);
    expect(await svc.getDriverById('d1')).toEqual(BASE_DRIVER);
    expect(await svc.getAllDrivers()).toEqual([BASE_DRIVER]);
  });
});
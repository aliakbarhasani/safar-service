/**
 * redis-location.test.js - تست یکپارچگی Redis Location Repository (P3-1)
 *
 * کلاینت Redis را ماک می‌کند و توابع GEOADD، GEOSEARCH، ZREM را اعتبارسنجی می‌کند.
 */

const { RedisLocationRepository, LOCATION_KEY } = require('../infrastructure/redis/redis-location.repository');
const { createMockRedisClient } = require('./mock-redis-client');

describe('RedisLocationRepository (P3-1)', () => {
  let repo;
  let client;

  beforeEach(() => {
    client = createMockRedisClient();
    repo = new RedisLocationRepository(client, { key: 'drivers:online:locations' });
  });

  describe('updateDriverLocation (GEOADD)', () => {
    test('should add driver location with valid coordinates', async () => {
      const result = await repo.updateDriverLocation('driver-1', 51.389, 35.6892);
      expect(result.ok).toBe(true);
      expect(result.driverId).toBe('driver-1');
      expect(result.longitude).toBe(51.389);
      expect(result.latitude).toBe(35.6892);
    });

    test('should update existing driver location (overwrite)', async () => {
      await repo.updateDriverLocation('driver-1', 51.389, 35.6892);
      const result = await repo.updateDriverLocation('driver-1', 52.5, 36.7);
      expect(result.ok).toBe(true);
      expect(result.longitude).toBe(52.5);
    });

    test('should reject invalid longitude (>180)', async () => {
      await expect(repo.updateDriverLocation('driver-1', 200, 35.6892)).rejects.toThrow(/longitude/);
    });

    test('should reject invalid latitude (<-90)', async () => {
      await expect(repo.updateDriverLocation('driver-1', 51.389, -100)).rejects.toThrow(/latitude/);
    });

    test('should reject missing driverId', async () => {
      await expect(repo.updateDriverLocation(null, 51.389, 35.6892)).rejects.toThrow(/driverId/);
    });
  });

  describe('findNearbyDrivers (GEOSEARCH)', () => {
    beforeEach(async () => {
      await repo.updateDriverLocation('driver-1', 51.389, 35.6892);
      await repo.updateDriverLocation('driver-2', 51.4, 35.69);
      await repo.updateDriverLocation('driver-3', 51.5, 35.7);
    });

    test('should find drivers within radius', async () => {
      const nearby = await repo.findNearbyDrivers(51.389, 35.6892, 5);
      expect(nearby.length).toBe(2);
      expect(nearby[0].driverId).toBe('driver-1');
      expect(nearby[0].distanceKm).toBeCloseTo(0, 1);
    });

    test('should return empty array when no drivers in radius', async () => {
      const nearby = await repo.findNearbyDrivers(40.0, 30.0, 10);
      expect(nearby).toEqual([]);
    });

    test('should order results by distance ASC', async () => {
      const nearby = await repo.findNearbyDrivers(51.389, 35.6892, 20);
      expect(nearby.length).toBe(3);
      for (let i = 1; i < nearby.length; i++) {
        expect(nearby[i].distanceKm).toBeGreaterThanOrEqual(nearby[i - 1].distanceKm);
      }
    });

    test('should include coordinates in results', async () => {
      const nearby = await repo.findNearbyDrivers(51.389, 35.6892, 2);
      expect(nearby[0]).toHaveProperty('longitude');
      expect(nearby[0]).toHaveProperty('latitude');
      expect(nearby[0]).toHaveProperty('distanceKm');
    });

    test('should reject non-positive radius', async () => {
      await expect(repo.findNearbyDrivers(51.389, 35.6892, 0)).rejects.toThrow(/radius/);
    });
  });

  describe('removeDriverLocation (ZREM)', () => {
    test('should remove driver from locations', async () => {
      await repo.updateDriverLocation('driver-1', 51.389, 35.6892);
      const result = await repo.removeDriverLocation('driver-1');
      expect(result.ok).toBe(true);
      expect(result.removed).toBe(true);
    });

    test('should return removed=false for non-existent driver', async () => {
      const result = await repo.removeDriverLocation('ghost');
      expect(result.ok).toBe(true);
      expect(result.removed).toBe(false);
    });

    test('should reject missing driverId', async () => {
      await expect(repo.removeDriverLocation(null)).rejects.toThrow(/driverId/);
    });
  });

  describe('getDriverLocation (GEOPOS)', () => {
    test('should return driver location', async () => {
      await repo.updateDriverLocation('driver-1', 51.389, 35.6892);
      const loc = await repo.getDriverLocation('driver-1');
      expect(loc).not.toBeNull();
      expect(loc.driverId).toBe('driver-1');
      expect(loc.longitude).toBeCloseTo(51.389, 4);
      expect(loc.latitude).toBeCloseTo(35.6892, 4);
    });

    test('should return null for non-existent driver', async () => {
      const loc = await repo.getDriverLocation('ghost');
      expect(loc).toBeNull();
    });
  });
});

describe('RedisLocationRepository with GEORADIUS fallback', () => {
  test('should use georadius when geosearch is not available', async () => {
    const client = createMockRedisClient();
    delete client.geosearch;
    const repo = new RedisLocationRepository(client, { key: LOCATION_KEY });
    await repo.updateDriverLocation('driver-1', 51.389, 35.6892);
    const nearby = await repo.findNearbyDrivers(51.389, 35.6892, 5);
    expect(nearby.length).toBe(1);
    expect(nearby[0].driverId).toBe('driver-1');
  });
});

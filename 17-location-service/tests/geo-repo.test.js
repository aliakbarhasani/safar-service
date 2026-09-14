'use strict';

/**
 * geo-repo.test.js - Location Service (P13-1)
 *
 * تست واحد RedisGeoRepository با کلاینت Redis ماک‌شده:
 *   - `geoadd`  : شعاع/مختصات به‌درستی به Redis ارسال می‌شوند + کلید TTL
 *   - `geosearch`: آرگومان‌های FROMLONLAT/BYRADIUS/WITHDIST/ASC درست
 *   - `zrem`    : حذف راننده + پاک‌شدن کلید last_active
 */

const { RedisGeoRepository } = require('../infrastructure/RedisGeoRepository');

function createMockRedis() {
  const calls = { geoadd: [], geosearch: [], zrem: [], set: [], del: [] };
  const store = new Map();
  return {
    calls,
    store,
    async geoadd(key, lon, lat, member) {
      calls.geoadd.push({ key, lon, lat, member });
      store.set(member, { lon, lat });
      return 1;
    },
    async geosearch(key, ...args) {
      calls.geosearch.push({ key, args });
      return ['d1', '1.2', 'd2', '3.4'];
    },
    async zrem(key, member) {
      calls.zrem.push({ key, member });
      return store.delete(member) ? 1 : 0;
    },
    async set(key, value, mode, ttl) {
      calls.set.push({ key, value, mode, ttl });
      store.set(key, value);
      return 'OK';
    },
    async del(key) {
      calls.del.push({ key });
      return store.has(key) ? 1 : 0;
    },
  };
}

describe('P13-1: RedisGeoRepository', () => {
  test('updateDriverLocation sends GEOADD with correct coords and sets 5min TTL key', async () => {
    const mock = createMockRedis();
    const repo = new RedisGeoRepository({ redisClient: mock });

    const out = await repo.updateDriverLocation('drv-1', 51.389, 35.6892);

    expect(out.driverId).toBe('drv-1');
    expect(mock.calls.geoadd).toHaveLength(1);
    expect(mock.calls.geoadd[0]).toEqual({
      key: 'drivers_location',
      lon: 51.389,
      lat: 35.6892,
      member: 'drv-1',
    });
    // TTL کلید آخرین فعالیت = ۵ دقیقه
    expect(mock.calls.set[0].key).toBe('driver_last_active:drv-1');
    expect(mock.calls.set[0].mode).toBe('EX');
    expect(mock.calls.set[0].ttl).toBe(300);
  });

  test('updateDriverLocation rejects invalid coordinates', async () => {
    const mock = createMockRedis();
    const repo = new RedisGeoRepository({ redisClient: mock });

    await expect(repo.updateDriverLocation('drv-1', 999, 0)).rejects.toThrow('out of range');
    await expect(repo.updateDriverLocation('drv-1', 'x', 10)).rejects.toThrow('valid lon/lat');
    expect(mock.calls.geoadd).toHaveLength(0);
  });

  test('findNearbyDrivers sends GEOSEARCH FROMLONLAT/BYRADIUS WITHDIST ASC and maps output', async () => {
    const mock = createMockRedis();
    const repo = new RedisGeoRepository({ redisClient: mock });

    const drivers = await repo.findNearbyDrivers(51.389, 35.6892, 3);

    const call = mock.calls.geosearch[0];
    expect(call.key).toBe('drivers_location');
    expect(call.args).toEqual([
      'FROMLONLAT', 51.389, 35.6892,
      'BYRADIUS', 3, 'km',
      'WITHDIST', 'ASC',
    ]);
    // خروجی ماک: [member, dist, member, dist] → [{driverId, distance}, ...]
    expect(drivers).toEqual([
      { driverId: 'd1', distance: 1.2 },
      { driverId: 'd2', distance: 3.4 },
    ]);
  });

  test('findNearbyDrivers rejects invalid radius', async () => {
    const mock = createMockRedis();
    const repo = new RedisGeoRepository({ redisClient: mock });
    await expect(repo.findNearbyDrivers(51, 35, 0)).rejects.toThrow('positive number');
    await expect(repo.findNearbyDrivers(51, 35, -1)).rejects.toThrow('positive number');
  });

  test('removeDriverLocation calls ZREM and deletes last-active key', async () => {
    const mock = createMockRedis();
    const repo = new RedisGeoRepository({ redisClient: mock });

    // راننده ابتدا آنلاین است (عضو ایندکس GEO + کلید last_active)
    await repo.updateDriverLocation('drv-9', 51.389, 35.6892);

    const out = await repo.removeDriverLocation('drv-9');

    expect(out.removed).toBe(true);
    expect(mock.calls.zrem[0]).toEqual({ key: 'drivers_location', member: 'drv-9' });
    expect(mock.calls.del[0]).toEqual({ key: 'driver_last_active:drv-9' });

    // حذف مجدد: عضو دیگر در ایندکس نیست → ZREM مقدار 0 برمی‌گرداند
    const again = await repo.removeDriverLocation('drv-9');
    expect(again.removed).toBe(false);
  });

  test('repository requires a redis client', () => {
    expect(() => new RedisGeoRepository({})).toThrow('requires a redisClient');
  });
});

describe('P13-1: FindNearbyDriversUseCase', () => {
  test('returns drivers sorted by distance and wraps with count/radius', async () => {
    const fakeRepo = {
      findNearbyDrivers: jest.fn().mockResolvedValue([
        { driverId: 'far', distance: 4.0 },
        { driverId: 'near', distance: 0.5 },
      ]),
    };
    const { FindNearbyDriversUseCase } = require('../application/FindNearbyDriversUseCase');
    const uc = new FindNearbyDriversUseCase({ geoRepository: fakeRepo });

    const out = await uc.execute({ lon: 51.389, lat: 35.6892, radiusKm: 4 });

    expect(fakeRepo.findNearbyDrivers).toHaveBeenCalledWith(51.389, 35.6892, 4);
    expect(out.count).toBe(2);
    expect(out.radiusKm).toBe(4);
    // مرتب‌سازی بر اساس فاصله
    expect(out.drivers[0].driverId).toBe('near');
    expect(out.drivers[1].driverId).toBe('far');
  });

  test('rejects invalid input with 400', async () => {
    const { FindNearbyDriversUseCase } = require('../application/FindNearbyDriversUseCase');
    const uc = new FindNearbyDriversUseCase({ geoRepository: { findNearbyDrivers: jest.fn() } });

    await expect(uc.execute({ lon: 'x', lat: 35 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(uc.execute({ lon: 51, lat: 35, radiusKm: 999 })).rejects.toMatchObject({ statusCode: 400 });
  });
});
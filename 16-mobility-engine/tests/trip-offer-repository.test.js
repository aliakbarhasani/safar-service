'use strict';

/**
 * trip-offer-repository.test.js - Mobility Engine (P13-2)
 *
 * تست واحد `TripOfferRepository` با کلاینت Redis ماک‌شده (بدون Redis واقعی):
 *   - createOffer : کلید `offer:{tripId}:{driverId}` با TTL پانزده ثانیه
 *   - getOffer    : خواندن/پارس وضعیت آفر و تشخیص انقضا (null)
 *   - lockTrip    : معنای SETNX (فقط یک برنده) روی `trip_lock:{tripId}`
 *   - releaseLock : آزادسازی قفل
 */

const TripOfferRepository = require('../infrastructure/redis/TripOfferRepository');

function createMockRedis() {
  const store = new Map();
  const calls = { set: [], get: [], del: [] };
  return {
    store,
    calls,
    async set(key, value, ...args) {
      calls.set.push({ key, value, args });
      if (args.includes('NX') && store.has(key)) return null; // SETNX روی کلید موجود
      const ttl = args.includes('EX') ? args[args.indexOf('EX') + 1] : null;
      store.set(key, { value, ttl });
      return 'OK';
    },
    async get(key) {
      calls.get.push({ key });
      const entry = store.get(key);
      return entry ? entry.value : null;
    },
    async del(key) {
      calls.del.push({ key });
      return store.delete(key) ? 1 : 0;
    },
  };
}

describe('P13-2: TripOfferRepository', () => {
  test('createOffer stores offer:{tripId}:{driverId} with 15s TTL', async () => {
    const redis = createMockRedis();
    const repo = new TripOfferRepository({ redisClient: redis });

    const offer = await repo.createOffer('trip-1', 'drv-1');

    expect(offer).toMatchObject({ tripId: 'trip-1', driverId: 'drv-1', status: 'PENDING' });
    const call = redis.calls.set[0];
    expect(call.key).toBe('offer:trip-1:drv-1');
    expect(call.args).toEqual(['EX', 15]);
    expect(JSON.parse(call.value)).toMatchObject({ tripId: 'trip-1', driverId: 'drv-1', status: 'PENDING' });
    // TTL ذخیره‌شده در ماک = ۱۵ ثانیه
    expect(redis.store.get('offer:trip-1:drv-1').ttl).toBe(15);
  });

  test('createOffer honours a custom expireSeconds and validates input', async () => {
    const redis = createMockRedis();
    const repo = new TripOfferRepository({ redisClient: redis });

    await repo.createOffer('trip-1', 'drv-2', 30);
    expect(redis.calls.set[0].args).toEqual(['EX', 30]);

    await expect(repo.createOffer('trip-1', 'drv-2', 0)).rejects.toThrow(/expireSeconds/);
    await expect(repo.createOffer('trip-1', 'drv-2', 1.5)).rejects.toThrow(/expireSeconds/);
    await expect(repo.createOffer(null, 'drv-2')).rejects.toThrow(/tripId و driverId/);
    expect(() => new TripOfferRepository({})).toThrow(/requires a redisClient/);
  });

  test('getOffer returns the parsed offer, and null when expired/missing', async () => {
    const redis = createMockRedis();
    const repo = new TripOfferRepository({ redisClient: redis });

    await repo.createOffer('trip-9', 'drv-9');
    const found = await repo.getOffer('trip-9', 'drv-9');
    expect(found).toMatchObject({ tripId: 'trip-9', driverId: 'drv-9', status: 'PENDING' });
    expect(redis.calls.get[0].key).toBe('offer:trip-9:drv-9');

    // آفر منقضی/ناموجود → null (یعنی راننده دیگر مجاز به پذیرش نیست)
    expect(await repo.getOffer('trip-9', 'drv-other')).toBeNull();
    expect(await repo.getOffer('trip-9')).toBeNull();

    // مقدار خراب در Redis نباید استثنا پرتاب کند
    redis.store.set('offer:trip-bad:drv-bad', { value: 'not-json', ttl: 15 });
    expect(await repo.getOffer('trip-bad', 'drv-bad')).toMatchObject({ status: 'PENDING' });
  });

  test('lockTrip implements SETNX: only the first driver wins', async () => {
    const redis = createMockRedis();
    const repo = new TripOfferRepository({ redisClient: redis });

    expect(await repo.lockTrip('trip-1', 'drv-1')).toBe(true);

    const call = redis.calls.set[0];
    expect(call.key).toBe('trip_lock:trip-1');
    expect(call.value).toBe('drv-1');
    expect(call.args).toEqual(['NX', 'EX', 30]);

    // راننده دوم قفل نمی‌گیرد (سفر قبلاً برداشته شده است)
    expect(await repo.lockTrip('trip-1', 'drv-2')).toBe(false);

    await expect(repo.lockTrip()).rejects.toThrow(/tripId/);
  });

  test('releaseLock deletes the trip lock', async () => {
    const redis = createMockRedis();
    const repo = new TripOfferRepository({ redisClient: redis });

    await repo.lockTrip('trip-5', 'drv-5');
    expect(await repo.releaseLock('trip-5')).toBe(1);
    expect(redis.calls.del[0].key).toBe('trip_lock:trip-5');
    expect(await repo.releaseLock('trip-5')).toBe(0);
  });
});
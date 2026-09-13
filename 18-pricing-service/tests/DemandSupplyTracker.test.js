/**
 * DemandSupplyTracker.test.js - Unit tests (P6-1)
 *
 * Uses an in-memory fake Redis client (no live Redis). Verifies:
 *  - demand key format `demand:<geohash>:15min` with INCR semantics
 *  - TTL (expire) is set only on the first increment of a window
 *  - getSupplyAndDemand ratio = demand / supply (explicit override works)
 *  - recordDemand returns the 5-char geohash of the origin
 */

const ngeohash = require('ngeohash');
const { DemandSupplyTracker } = require('../infrastructure/DemandSupplyTracker');

function createFakeRedis() {
  const store = new Map();
  const expiries = new Map();
  return {
    _store: store,
    _expiries: expiries,
    async incr(key) {
      const next = (parseInt(store.get(key) || '0', 10) || 0) + 1;
      store.set(key, String(next));
      return next;
    },
    async get(key) {
      const v = store.get(key);
      return v === undefined ? null : v;
    },
    async set(key, value, _mode, seconds) {
      store.set(key, String(value));
      if (seconds != null) expiries.set(key, seconds);
      return 'OK';
    },
    async expire(key, seconds) {
      expiries.set(key, seconds);
      return 1;
    },
    async ttl() { return 900; },
  };
}

const LAT = 35.6997;
const LNG = 51.3378;

describe('DemandSupplyTracker (P6-1)', () => {
  test('recordDemand increments demand:<geohash>:15min and sets TTL once', async () => {
    const redis = createFakeRedis();
    const tracker = new DemandSupplyTracker(redis, { ttlSeconds: 900 });
    const expected = ngeohash.encode(LAT, LNG, 5);

    const first = await tracker.recordDemand(LAT, LNG);
    expect(first.geohash).toBe(expected);
    expect(first.demand).toBe(1);
    expect(redis._store.get(`demand:${expected}:15min`)).toBe('1');
    expect(redis._expiries.get(`demand:${expected}:15min`)).toBe(900);

    const second = await tracker.recordDemand(LAT, LNG);
    expect(second.demand).toBe(2);
    // expiry recorded exactly once -> map still has a single entry
    expect(redis._expiries.size).toBe(1);
  });

  test('getSupplyAndDemand returns demand/supply ratio (override supported)', async () => {
    const redis = createFakeRedis();
    const tracker = new DemandSupplyTracker(redis);
    const gh = ngeohash.encode(LAT, LNG, 5);
    redis._store.set(`demand:${gh}:15min`, '6');
    redis._store.set(`supply:${gh}`, '3');

    const res = await tracker.getSupplyAndDemand(gh);
    expect(res.demand).toBe(6);
    expect(res.supply).toBe(3);
    expect(res.ratio).toBeCloseTo(2.0);

    const overridden = await tracker.getSupplyAndDemand(gh, { supply: 2 });
    expect(overridden.ratio).toBeCloseTo(3.0);
  });

  test('missing demand reads as 0 (no surge)', async () => {
    const redis = createFakeRedis();
    const tracker = new DemandSupplyTracker(redis);
    const gh = ngeohash.encode(LAT, LNG, 5);
    const res = await tracker.getSupplyAndDemand(gh);
    expect(res.demand).toBe(0);
    expect(res.ratio).toBe(0);
  });
});

describe('DemandSupplyTracker.getActiveSurgeZones (P6-2)', () => {
  function createSocialFakeRedis() {
    const store = new Map();
    const sets = new Map();
    return {
      _store: store,
      async incr(key) {
        const next = (parseInt(store.get(key) || '0', 10) || 0) + 1;
        store.set(key, String(next));
        return next;
      },
      async get(key) {
        const v = store.get(key);
        return v === undefined ? null : v;
      },
      async set(key, value, _mode, _seconds) {
        store.set(key, String(value));
        return 'OK';
      },
      async expire() { return 1; },
      async sadd(setKey, member) {
        if (!sets.has(setKey)) sets.set(setKey, new Set());
        sets.get(setKey).add(member);
        return 1;
      },
      async smembers(setKey) {
        return sets.has(setKey) ? Array.from(sets.get(setKey)) : [];
      },
      async scan(cursor, _m, _pattern, _c, _count) {
        const keys = Array.from(store.keys()).filter((k) => /^demand:.*:15min$/.test(k));
        return ['0', keys];
      },
    };
  }

  test('recordDemand registers geohash in active_geohashes SET', async () => {
    const redis = createSocialFakeRedis();
    const tracker = new DemandSupplyTracker(redis);
    await tracker.recordDemand(LAT, LNG);
    const members = await redis.smembers('active_geohashes');
    expect(members).toContain(ngeohash.encode(LAT, LNG, 5));
  });

  test('returns only zones with surge > 1.0 (via SMEMBERS fast path)', async () => {
    const redis = createSocialFakeRedis();
    const tracker = new DemandSupplyTracker(redis);
    const hotGh = ngeohash.encode(LAT, LNG, 5);        // demand 6 / supply 1 -> surge 2.0
    const coolGh = ngeohash.encode(34.0, 50.0, 5);     // demand 1 / default 3 -> no surge

    for (let i = 0; i < 6; i += 1) await tracker.recordDemand(LAT, LNG);
    await tracker.recordDemand(34.0, 50.0);
    await tracker.setSupply(hotGh, 1);

    const zones = await tracker.getActiveSurgeZones();
    const hot = zones.find((z) => z.geohash === hotGh);
    const cool = zones.find((z) => z.geohash === coolGh);
    expect(hot).toBeDefined();
    expect(hot.surge).toBeGreaterThan(1.0);
    expect(hot.surge).toBeLessThanOrEqual(2.0);
    expect(cool).toBeUndefined();
  });

  test('falls back to SCAN when SMEMBERS is unavailable', async () => {
    const redis = createSocialFakeRedis();
    delete redis.smembers; // مجبور به SCAN
    const tracker = new DemandSupplyTracker(redis);
    const hotGh = ngeohash.encode(LAT, LNG, 5);

    for (let i = 0; i < 4; i += 1) await tracker.recordDemand(LAT, LNG);
    await tracker.setSupply(hotGh, 1);

    const zones = await tracker.getActiveSurgeZones();
    expect(zones).toHaveLength(1);
    expect(zones[0].geohash).toBe(hotGh);
    expect(zones[0].surge).toBeGreaterThan(1.0);
  });

  test('returns empty list when there is no demand anywhere', async () => {
    const redis = createSocialFakeRedis();
    const tracker = new DemandSupplyTracker(redis);
    const zones = await tracker.getActiveSurgeZones();
    expect(zones).toEqual([]);
  });
});

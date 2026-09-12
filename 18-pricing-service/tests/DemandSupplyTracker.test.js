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

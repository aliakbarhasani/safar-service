'use strict';
const { DynamicConfigStore } = require('../../14-config-system/infrastructure/DynamicConfigStore');
const { ConfigController } = require('../controllers/ConfigController');

function createMockRedis(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async set(k, v) { store.set(k, v); return 'OK'; },
    _get(k) { return store.has(k) ? store.get(k) : null; },
  };
}
function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ok: ' + m); }

async function test(name, fn) {
  try { await fn(); console.log('PASS: ' + name); }
  catch (e) { console.error('FAIL: ' + name + ' -- ' + e.message); process.exitCode = 1; }
}

async function run() {
  console.log('\n-- DynamicConfigStore --');

  await test('getConfig from Redis', async () => {
    const r = createMockRedis({ 'app_config:trip.baseFare': '20000' });
    const s = new DynamicConfigStore({ redisClient: r });
    assert((await s.getConfig('trip.baseFare')) === 20000, 'returns 20000');
  });

  await test('getConfig fallback to defaults', async () => {
    const r = createMockRedis();
    const s = new DynamicConfigStore({ redisClient: r, defaults: { 'trip.baseFare': 15000 } });
    assert((await s.getConfig('trip.baseFare')) === 15000, 'returns 15000 default');
  });

  await test('getConfig returns null if nowhere', async () => {
    const s = new DynamicConfigStore({});
    assert((await s.getConfig('x.y')) === null, 'returns null');
  });

  await test('setConfig writes JSON to Redis', async () => {
    const r = createMockRedis();
    const s = new DynamicConfigStore({ redisClient: r });
    await s.setConfig('trip.baseFare', 25000);
    assert(r._get('app_config:trip.baseFare') === '25000', 'redis has JSON');
  });

  await test('local cache avoids 2nd Redis call', async () => {
    let calls = 0;
    const r = createMockRedis({ 'app_config:trip.perKmRate': '3000' });
    const orig = r.get.bind(r);
    r.get = async (k) => { calls++; return orig(k); };
    const s = new DynamicConfigStore({ redisClient: r });
    await s.getConfig('trip.perKmRate');
    await s.getConfig('trip.perKmRate');
    assert(calls === 1, 'only 1 redis call, got ' + calls);
  });

  await test('cache expires after TTL', async () => {
    const r = createMockRedis({ 'app_config:k': '42' });
    const s = new DynamicConfigStore({ redisClient: r, cacheTtlSeconds: 0 });
    await s.getConfig('k');
    assert(s._getLocal('k') === undefined, 'local cache expired');
  });

  await test('getMultiple returns all keys', async () => {
    const r = createMockRedis({ 'app_config:a': '1', 'app_config:b': '2' });
    const s = new DynamicConfigStore({ redisClient: r });
    const res = await s.getMultiple(['a', 'b']);
    assert(res.a === 1 && res.b === 2, 'both keys returned');
  });

  await test('Redis error falls back to default', async () => {
    const r = { get: async () => { throw new Error('fail'); }, set: async () => { throw new Error('fail'); } };
    const s = new DynamicConfigStore({ redisClient: r, defaults: { 'trip.baseFare': 10000 } });
    assert((await s.getConfig('trip.baseFare')) === 10000, 'default used');
  });

  console.log('\n-- ConfigController --');

  await test('getAll returns success JSON', async () => {
    const r = createMockRedis({ 'app_config:trip.baseFare': '15000' });
    const s = new DynamicConfigStore({ redisClient: r });
    const c = new ConfigController({ configStore: s, editableKeys: ['trip.baseFare'] });
    let d = null;
    await c.getAll({}, { json: (v) => { d = v; } });
    assert(d && d.success === true && d.data.trip.baseFare === 15000, 'success JSON');
  });

  await test('getOne 404 for missing', async () => {
    const s = new DynamicConfigStore({ redisClient: createMockRedis() });
    const c = new ConfigController({ configStore: s });
    let st = null, b = null;
    await c.getOne({ params: { key: 'missing' } }, { json: (v) => { b = v; }, status: (v) => { st = v; return { json: (v2) => { b = v2; } }; } });
    assert(st === 404, 'returns 404');
  });

  await test('update rejects non-editable', async () => {
    const s = new DynamicConfigStore({ redisClient: createMockRedis() });
    const c = new ConfigController({ configStore: s, editableKeys: ['trip.baseFare'] });
    let st = null, b = null;
    await c.update({ body: { 'secret.k': 1 } }, { json: (v) => { b = v; }, status: (v) => { st = v; return { json: (v2) => { b = v2; } }; } });
    assert(st === 400, 'returns 400');
  });

  await test('update succeeds for editable', async () => {
    const r = createMockRedis();
    const s = new DynamicConfigStore({ redisClient: r });
    const c = new ConfigController({ configStore: s, editableKeys: ['trip.baseFare'] });
    let b = null;
    await c.update({ body: { 'trip.baseFare': 30000 } }, { json: (v) => { b = v; } });
    assert(b && b.success === true && b.data['trip.baseFare'] === 30000, 'updated');
  });

  console.log('\n-- Done --');
}

run().catch((e) => { console.error(e); process.exit(1); });

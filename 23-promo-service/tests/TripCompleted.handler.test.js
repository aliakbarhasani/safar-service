'use strict';

const { TripCompletedHandler } = require('../handlers/TripCompleted.handler');

function makePool({
  insertRows = [{ id: 'usage-1' }],
  updateRows = [{ code: 'SAVE10' }],
  existingRows = [],
  promoRows = [{
    code: 'SAVE10',
    is_active: true,
    expires_at: null,
    max_uses_per_user: 1,
    global_max_uses: 0,
    current_uses: 0,
  }],
  usageCountRows = [{ usage_count: 0 }],
} = {}) {
  const queries = [];
  const client = {
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SELECT user_id, promo_code FROM promo_usages')) return { rows: existingRows };
      if (sql.startsWith('SELECT code, is_active, expires_at')) return { rows: promoRows };
      if (sql.startsWith('SELECT COUNT(*)::int AS usage_count')) return { rows: usageCountRows };
      if (sql.startsWith('INSERT INTO promo_usages')) return { rows: insertRows };
      if (sql.startsWith('UPDATE promo_codes')) return { rows: updateRows };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  return { queries, client, connect: jest.fn(async () => client) };
}

const event = (overrides = {}) => ({
  tripId: 'trip-1',
  passengerId: 'user-1',
  promoCode: 'SAVE10',
  ...overrides,
});

describe('Promo TripCompletedHandler', () => {
  test('records usage and increments counter in one transaction after locking and checking limits', async () => {
    const pool = makePool();
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle(event())).resolves.toMatchObject({ consumed: true, tripId: 'trip-1' });

    expect(pool.client.query.mock.calls[0][0]).toBe('BEGIN');
    expect(pool.client.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM promo_codes WHERE code = $1 FOR UPDATE'),
      ['SAVE10'],
    );
    expect(pool.client.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT COUNT(*)::int AS usage_count'),
      ['user-1', 'SAVE10'],
    );
    expect(pool.client.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (trip_id) WHERE trip_id IS NOT NULL DO NOTHING RETURNING id'),
      ['user-1', 'SAVE10', 'trip-1'],
    );
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(true);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  test('accepts an exact replay without incrementing usage counter', async () => {
    const pool = makePool({ existingRows: [{ user_id: 'user-1', promo_code: 'SAVE10' }] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle(event())).resolves.toMatchObject({ consumed: false, duplicate: true });

    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('SELECT code, is_active'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

  test('rejects a replay with a different user or promo code and rolls back', async () => {
    const pool = makePool({ existingRows: [{ user_id: 'someone-else', promo_code: 'SAVE10' }] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle(event())).rejects.toMatchObject({ code: 'PROMO_USAGE_IDEMPOTENCY_CONFLICT' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(false);
  });

  test('fails closed if a prior usage conflict cannot be reconciled', async () => {
    // Simulate a unique-index race: the initial lookup is empty, insert loses,
    // and the post-conflict lookup cannot find the winning row.
    const existingRowsByCall = [[], []];
    const pool = makePool({ insertRows: [] });
    pool.client.query.mockImplementation(async (sql, params) => {
      pool.queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SELECT user_id, promo_code FROM promo_usages')) return { rows: existingRowsByCall.shift() || [] };
      if (sql.startsWith('SELECT code, is_active, expires_at')) return { rows: [{ code: 'SAVE10', is_active: true, expires_at: null, max_uses_per_user: 1, global_max_uses: 0, current_uses: 0 }] };
      if (sql.startsWith('SELECT COUNT(*)::int AS usage_count')) return { rows: [{ usage_count: 0 }] };
      if (sql.startsWith('INSERT INTO promo_usages')) return { rows: [] };
      return { rows: [] };
    });

    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });
    await expect(handler.handle(event())).rejects.toMatchObject({ code: 'PROMO_USAGE_IDEMPOTENCY_STATE_INVALID' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });

  test('reconciles a same-trip event that commits while waiting for the promo lock', async () => {
    let priorLookups = 0;
    const pool = makePool();
    pool.client.query.mockImplementation(async (sql, params) => {
      pool.queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SELECT user_id, promo_code FROM promo_usages')) {
        priorLookups += 1;
        return { rows: priorLookups === 1 ? [] : [{ user_id: 'user-1', promo_code: 'SAVE10' }] };
      }
      if (sql.startsWith('SELECT code, is_active, expires_at')) {
        return { rows: [{ code: 'SAVE10', is_active: true, expires_at: null, max_uses_per_user: 1, global_max_uses: 1, current_uses: 1 }] };
      }
      return { rows: [] };
    });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle(event())).resolves.toMatchObject({ consumed: false, duplicate: true });
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO promo_usages'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

  test('enforces the global usage limit under the promo row lock', async () => {
    const pool = makePool({
      promoRows: [{ code: 'SAVE10', is_active: true, expires_at: null, max_uses_per_user: 1, global_max_uses: 5, current_uses: 5 }],
    });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle(event())).rejects.toMatchObject({ code: 'PROMO_GLOBAL_LIMIT_REACHED' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO promo_usages'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });

  test('enforces the per-user usage limit and rolls back without inserting', async () => {
    const pool = makePool({ usageCountRows: [{ usage_count: 1 }] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle(event())).rejects.toMatchObject({ code: 'PROMO_USER_LIMIT_REACHED' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO promo_usages'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });

  test('rejects inactive and expired promo codes', async () => {
    const inactivePool = makePool({ promoRows: [{ code: 'SAVE10', is_active: false, expires_at: null, max_uses_per_user: 1, global_max_uses: 0, current_uses: 0 }] });
    const inactive = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool: inactivePool });
    await expect(inactive.handle(event())).rejects.toMatchObject({ code: 'PROMO_CODE_INACTIVE' });

    const expiredPool = makePool({ promoRows: [{ code: 'SAVE10', is_active: true, expires_at: '2000-01-01T00:00:00Z', max_uses_per_user: 1, global_max_uses: 0, current_uses: 0 }] });
    const expired = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool: expiredPool });
    await expect(expired.handle(event())).rejects.toMatchObject({ code: 'PROMO_CODE_EXPIRED' });
  });

  test('fails closed if promo code disappeared before usage recording', async () => {
    const pool = makePool({ promoRows: [] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });
    await expect(handler.handle(event())).rejects.toMatchObject({ code: 'PROMO_CODE_NOT_FOUND' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });

  test('rolls back usage if promo counter update fails', async () => {
    const pool = makePool({ updateRows: [] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });
    await expect(handler.handle(event({ promoCode: 'MISSING' }))).rejects.toMatchObject({ code: 'PROMO_CODE_NOT_FOUND' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  test('fails closed without a transaction-capable PostgreSQL pool', async () => {
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {} });
    await expect(handler.handle(event())).rejects.toMatchObject({ code: 'PROMO_USAGE_TRANSACTION_UNAVAILABLE' });
  });

  test('subscription returns a failed processing result so OutboxRelay can retry', async () => {
    let listener;
    const eventBus = { on: jest.fn((eventName, callback) => { listener = callback; }), logger: { error: jest.fn() } };
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, eventBus });
    handler.subscribe();

    const result = await listener({ event: 'TripCompleted', data: event() });
    expect(eventBus.on).toHaveBeenCalledWith('TripCompleted', expect.any(Function));
    expect(result).toMatchObject({ processed: false, consumed: false, reason: 'PROMO_USAGE_TRANSACTION_UNAVAILABLE' });
    expect(eventBus.logger.error).toHaveBeenCalled();
  });

  test('subscription awaits and returns successful promo usage processing', async () => {
    let listener;
    const eventBus = { on: jest.fn((eventName, callback) => { listener = callback; }) };
    const pool = makePool();
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool, eventBus });
    handler.subscribe();

    await expect(listener({ event: 'TripCompleted', data: event() })).resolves.toMatchObject({ consumed: true, tripId: 'trip-1' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

  test('ignores trips that have no promo code', async () => {
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {} });
    await expect(handler.handle({ tripId: 'trip-1', passengerId: 'user-1' })).resolves.toEqual({ consumed: false });
  });
});

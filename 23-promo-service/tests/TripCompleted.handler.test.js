'use strict';

const { TripCompletedHandler } = require('../handlers/TripCompleted.handler');

function makePool({
  insertRows = [{ id: 'usage-1' }],
  updateRows = [{ code: 'SAVE10' }],
  existingRows = [{ user_id: 'user-1', promo_code: 'SAVE10' }],
} = {}) {
  const queries = [];
  const client = {
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('INSERT INTO promo_usages')) return { rows: insertRows };
      if (sql.startsWith('SELECT user_id, promo_code FROM promo_usages')) return { rows: existingRows };
      if (sql.startsWith('UPDATE promo_codes')) return { rows: updateRows };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  return {
    queries,
    client,
    connect: jest.fn(async () => client),
  };
}

describe('Promo TripCompletedHandler', () => {
  test('records usage and increments counter in one transaction', async () => {
    const pool = makePool();
    const handler = new TripCompletedHandler({
      promoCodeModel: {},
      promoUsageModel: {},
      pool,
    });

    await expect(handler.handle({
      tripId: 'trip-1',
      passengerId: 'user-1',
      promoCode: 'SAVE10',
    })).resolves.toMatchObject({ consumed: true, tripId: 'trip-1' });

    expect(pool.client.query.mock.calls[0][0]).toBe('BEGIN');
    expect(pool.client.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (trip_id) WHERE trip_id IS NOT NULL DO NOTHING RETURNING id'),
      ['user-1', 'SAVE10', 'trip-1'],
    );
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(true);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  test('accepts an exact replay without incrementing usage counter', async () => {
    const pool = makePool({ insertRows: [] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle({
      tripId: 'trip-1',
      passengerId: 'user-1',
      promoCode: 'SAVE10',
    })).resolves.toMatchObject({ consumed: false, duplicate: true });

    expect(pool.client.query).toHaveBeenCalledWith(
      'SELECT user_id, promo_code FROM promo_usages WHERE trip_id = $1 FOR UPDATE',
      ['trip-1'],
    );
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

  test('rejects a replay with a different user or promo code and rolls back', async () => {
    const pool = makePool({
      insertRows: [],
      existingRows: [{ user_id: 'someone-else', promo_code: 'SAVE10' }],
    });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle({
      tripId: 'trip-1',
      passengerId: 'user-1',
      promoCode: 'SAVE10',
    })).rejects.toMatchObject({ code: 'PROMO_USAGE_IDEMPOTENCY_CONFLICT' });

    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(false);
  });

  test('fails closed if an insert conflict has no matching usage row', async () => {
    const pool = makePool({ insertRows: [], existingRows: [] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle({
      tripId: 'trip-1',
      passengerId: 'user-1',
      promoCode: 'SAVE10',
    })).rejects.toMatchObject({ code: 'PROMO_USAGE_IDEMPOTENCY_STATE_INVALID' });

    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });

  test('rolls back usage if promo counter update fails', async () => {
    const pool = makePool({ updateRows: [] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle({
      tripId: 'trip-1',
      passengerId: 'user-1',
      promoCode: 'MISSING',
    })).rejects.toMatchObject({ code: 'PROMO_CODE_NOT_FOUND' });

    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  test('fails closed without a transaction-capable PostgreSQL pool', async () => {
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {} });
    await expect(handler.handle({
      tripId: 'trip-1',
      passengerId: 'user-1',
      promoCode: 'SAVE10',
    })).rejects.toMatchObject({ code: 'PROMO_USAGE_TRANSACTION_UNAVAILABLE' });
  });

  test('subscription returns a failed processing result so OutboxRelay can retry', async () => {
    let listener;
    const eventBus = {
      on: jest.fn((eventName, callback) => { listener = callback; }),
      logger: { error: jest.fn() },
    };
    const handler = new TripCompletedHandler({
      promoCodeModel: {},
      promoUsageModel: {},
      eventBus,
      // Intentionally no pool: a promo-bearing event must fail closed.
    });
    handler.subscribe();

    const result = await listener({
      event: 'TripCompleted',
      data: { tripId: 'trip-1', passengerId: 'user-1', promoCode: 'SAVE10' },
    });

    expect(eventBus.on).toHaveBeenCalledWith('TripCompleted', expect.any(Function));
    expect(result).toMatchObject({
      processed: false,
      consumed: false,
      reason: 'PROMO_USAGE_TRANSACTION_UNAVAILABLE',
    });
    expect(eventBus.logger.error).toHaveBeenCalled();
  });

  test('subscription awaits and returns successful promo usage processing', async () => {
    let listener;
    const eventBus = { on: jest.fn((eventName, callback) => { listener = callback; }) };
    const pool = makePool();
    const handler = new TripCompletedHandler({
      promoCodeModel: {},
      promoUsageModel: {},
      pool,
      eventBus,
    });
    handler.subscribe();

    await expect(listener({
      event: 'TripCompleted',
      data: { tripId: 'trip-1', passengerId: 'user-1', promoCode: 'SAVE10' },
    })).resolves.toMatchObject({ consumed: true, tripId: 'trip-1' });
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

  test('ignores trips that have no promo code', async () => {
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {} });
    await expect(handler.handle({ tripId: 'trip-1', passengerId: 'user-1' }))
      .resolves.toEqual({ consumed: false });
  });
});

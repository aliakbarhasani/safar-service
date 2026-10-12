'use strict';

const { TripCompletedHandler } = require('../handlers/TripCompleted.handler');

function makePool({ insertRows = [{ id: 'usage-1' }], updateRows = [{ code: 'SAVE10' }] } = {}) {
  const queries = [];
  const client = {
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('INSERT INTO promo_usages')) return { rows: insertRows };
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

  test('does not increment usage counter when a completion event is replayed', async () => {
    const pool = makePool({ insertRows: [] });
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {}, pool });

    await expect(handler.handle({
      tripId: 'trip-1',
      passengerId: 'user-1',
      promoCode: 'SAVE10',
    })).resolves.toMatchObject({ consumed: false, duplicate: true });

    expect(pool.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE promo_codes'))).toBe(false);
    expect(pool.client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
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

  test('ignores trips that have no promo code', async () => {
    const handler = new TripCompletedHandler({ promoCodeModel: {}, promoUsageModel: {} });
    await expect(handler.handle({ tripId: 'trip-1', passengerId: 'user-1' }))
      .resolves.toEqual({ consumed: false });
  });
});

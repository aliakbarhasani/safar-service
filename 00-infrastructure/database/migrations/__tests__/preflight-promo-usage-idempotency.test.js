'use strict';

const { runPreflight } = require('../preflight-promo-usage-idempotency');

function makeClient({ table = 'promo_usages', duplicateTripIds = 0, excessRows = 0 } = {}) {
  return {
    query: jest.fn(async (sql) => {
      if (sql === 'BEGIN READ ONLY' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes("to_regclass('promo_usages')")) {
        return { rows: [{ table_name: table }] };
      }
      if (sql.includes('GROUP BY trip_id')) {
        return {
          rows: [{
            duplicate_trip_ids: String(duplicateTripIds),
            excess_rows: String(excessRows),
          }],
        };
      }
      throw new Error('Unexpected query in preflight test');
    }),
  };
}

describe('promo usage idempotency read-only preflight', () => {
  test('reports ready when no duplicate non-null trip IDs exist', async () => {
    const client = makeClient();
    await expect(runPreflight(client)).resolves.toEqual({
      ready: true,
      duplicateTripIds: 0,
      excessRows: 0,
    });
    expect(client.query.mock.calls[0][0]).toBe('BEGIN READ ONLY');
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(client.query.mock.calls.some(([sql]) => /DELETE|UPDATE|INSERT|CREATE|DROP/i.test(sql))).toBe(false);
  });

  test('blocks migration readiness without changing historical duplicate rows', async () => {
    const client = makeClient({ duplicateTripIds: 2, excessRows: 3 });
    await expect(runPreflight(client)).resolves.toEqual({
      ready: false,
      duplicateTripIds: 2,
      excessRows: 3,
    });
    expect(client.query.mock.calls[0][0]).toBe('BEGIN READ ONLY');
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(client.query.mock.calls.some(([sql]) => /DELETE|UPDATE|INSERT|CREATE|DROP/i.test(sql))).toBe(false);
  });

  test('fails and rolls back if the target schema has no promo_usages table', async () => {
    const client = makeClient({ table: null });
    await expect(runPreflight(client)).rejects.toMatchObject({
      code: 'PROMO_USAGE_TABLE_MISSING',
    });
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  test('rolls back and preserves query failures', async () => {
    const failure = Object.assign(new Error('read failed'), { code: 'XX000' });
    const client = makeClient();
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN READ ONLY') return { rows: [] };
      if (sql.includes("to_regclass('promo_usages')")) return { rows: [{ table_name: 'promo_usages' }] };
      if (sql.includes('GROUP BY trip_id')) throw failure;
      if (sql === 'ROLLBACK') return { rows: [] };
      throw new Error('Unexpected query');
    });
    await expect(runPreflight(client)).rejects.toMatchObject({ code: 'XX000' });
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});

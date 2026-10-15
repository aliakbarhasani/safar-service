'use strict';

jest.mock('../db/pg', () => ({
  query: jest.fn(),
}));

const pg = require('../db/pg');
const Transaction = require('../models/transaction.model');

describe('transaction history currency filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pg.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('filters user transaction rows by currency code and type', async () => {
    await Transaction.findByUserId('user-1', {
      limit: 10,
      offset: 0,
      type: 'CREDIT',
      currencyId: 'IRT',
    });

    const [sql, params] = pg.query.mock.calls[0];
    expect(sql).toContain('AND type = $2');
    expect(sql).toContain('currency_id IN');
    expect(sql).toContain('SELECT id FROM currencies WHERE code = $3 OR id::text = $3');
    expect(params).toEqual(['user-1', 'CREDIT', 'IRT', 10, 0]);
  });

  test('filters transaction counts by currency code and type', async () => {
    pg.query.mockResolvedValue({ rows: [{ total: '3' }], rowCount: 1 });

    await expect(Transaction.countByUserId('user-1', 'DEBIT', 'USD')).resolves.toBe(3);

    const [sql, params] = pg.query.mock.calls[0];
    expect(sql).toContain('AND type = $2');
    expect(sql).toContain('currency_id IN');
    expect(sql).toContain('SELECT id FROM currencies WHERE code = $3 OR id::text = $3');
    expect(params).toEqual(['user-1', 'DEBIT', 'USD']);
  });

  test('preserves unfiltered query compatibility when currency is omitted', async () => {
    await Transaction.findByUserId('user-1', { limit: 20, offset: 0, type: null });

    const [sql, params] = pg.query.mock.calls[0];
    expect(sql).not.toContain('currency_id IN');
    expect(params).toEqual(['user-1', 20, 0]);
  });
});

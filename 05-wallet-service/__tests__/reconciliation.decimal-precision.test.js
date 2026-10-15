'use strict';

const mockQuery = jest.fn();
const mockSnapshot = jest.fn();

jest.mock('../db/pg', () => ({ query: (...args) => mockQuery(...args) }));
jest.mock('../models/wallet.model', () => ({
  getReconciliationSnapshot: (...args) => mockSnapshot(...args),
}));

const reconciliation = require('../jobs/reconciliation.job');

describe('wallet reconciliation decimal precision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('compares PostgreSQL NUMERIC values exactly above JavaScript safe integer range', async () => {
    mockSnapshot.mockResolvedValue({
      wallet_id: 'wallet-1',
      total_balance: '9007199254740993.00000000',
      available_balance: '9007199254740993.00000000',
      frozen_balance: '0.00000000',
      ledger_total_credits: '9007199254740992.00000000',
      ledger_total_debits: '0.00000000',
      ledger_balance: '9007199254740992.00000000',
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await reconciliation.reconcileSingleWallet('wallet-1');

    expect(result.status).toBe('discrepancy_found');
    expect(result.discrepancy).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1][0]).toBe('reconciliation_discrepancy');
  });

  test('treats equivalent decimal representations as equal', async () => {
    mockSnapshot.mockResolvedValue({
      wallet_id: 'wallet-2',
      total_balance: '125.50000000',
      available_balance: '125.50000000',
      frozen_balance: '0.00000000',
      ledger_total_credits: '125.50000000',
      ledger_total_debits: '0.00000000',
      ledger_balance: '125.50000000',
    });

    const result = await reconciliation.reconcileSingleWallet('wallet-2');

    expect(result.status).toBe('ok');
    expect(result.discrepancy).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('parses positive and negative decimal values into exact scaled integers', () => {
    expect(reconciliation.toScaledInteger('125.5')).toBe(12550000000n);
    expect(reconciliation.toScaledInteger('-0.25')).toBe(-25000000n);
    expect(reconciliation.toScaledInteger('0')).toBe(0n);
  });

  test('rejects decimal values with precision beyond the database scale', () => {
    expect(() => reconciliation.toScaledInteger('1.000000001')).toThrow(/precision exceeds/);
  });
});

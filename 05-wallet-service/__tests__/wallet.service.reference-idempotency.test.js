'use strict';

const mockClient = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
};

jest.mock('../db/pg', () => ({
  transaction: jest.fn((callback) => callback(mockClient)),
}));
jest.mock('../models/wallet.model', () => ({
  findByUserAndCurrency: jest.fn(),
  create: jest.fn(),
  creditAvailableBalance: jest.fn(),
  debitAvailableBalance: jest.fn(),
}));
jest.mock('../models/transaction.model', () => ({
  findByReferenceId: jest.fn(),
  create: jest.fn(),
  createLedgerEntry: jest.fn(),
}));
jest.mock('../models/escrow.model', () => ({}));
jest.mock('../../14-config-system/server.config', () => ({ wallet: {}, trip: {} }));
jest.mock('../../01-core-system/EventBus', () => ({ publish: jest.fn() }));

const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const walletService = require('../services/wallet.service');

describe('wallet reference idempotency locking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    Transaction.findByReferenceId.mockResolvedValue({
      id: 'existing-transaction',
      reference_id: 'external-reference-1',
    });
  });

  test('serializes duplicate deposits before checking the existing reference', async () => {
    await expect(
      walletService.depositFunds('user-1', 100, 'IRT', 'external-reference-1')
    ).rejects.toThrow('Duplicate transaction');

    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['wallet-reference:external-reference-1'],
    );
    expect(mockClient.query.mock.invocationCallOrder[0])
      .toBeLessThan(Transaction.findByReferenceId.mock.invocationCallOrder[0]);
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  test('serializes duplicate withdrawals before checking the existing reference', async () => {
    await expect(
      walletService.withdrawFunds('user-1', 100, 'IRT', 'external-reference-1')
    ).rejects.toThrow('Duplicate transaction');

    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['wallet-reference:external-reference-1'],
    );
    expect(mockClient.query.mock.invocationCallOrder[0])
      .toBeLessThan(Transaction.findByReferenceId.mock.invocationCallOrder[0]);
    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });
});

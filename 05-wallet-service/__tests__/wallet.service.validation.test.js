'use strict';

jest.mock('../db/pg', () => ({
  transaction: jest.fn(),
  query: jest.fn(),
}));
jest.mock('../models/wallet.model', () => ({
  findByUserAndCurrency: jest.fn(),
}));
jest.mock('../models/transaction.model', () => ({
  findByUserId: jest.fn(),
  countByUserId: jest.fn(),
}));
jest.mock('../models/escrow.model', () => ({}));
jest.mock('../../14-config-system/server.config', () => ({ wallet: {}, trip: { commissionRates: {} } }));
jest.mock('../../01-core-system/EventBus', () => ({ publish: jest.fn() }));

const pg = require('../db/pg');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const walletService = require('../services/wallet.service');

describe('wallet service input validation and read paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a missing user before querying the wallet table', async () => {
    await expect(walletService.getWalletBalance(null, 'IRT'))
      .rejects.toThrow('User ID is required');
    expect(Wallet.findByUserAndCurrency).not.toHaveBeenCalled();
  });

  test('rejects an empty currency before querying the wallet table', async () => {
    await expect(walletService.getWalletBalance('user-1', ''))
      .rejects.toThrow('Currency ID is required');
    expect(Wallet.findByUserAndCurrency).not.toHaveBeenCalled();
  });

  test('returns a zero-valued no-wallet result without starting a transaction', async () => {
    Wallet.findByUserAndCurrency.mockResolvedValue(null);

    await expect(walletService.getWalletBalance('user-1', 'IRT')).resolves.toMatchObject({
      balance: 0,
      availableBalance: 0,
      frozenBalance: 0,
      currencyId: 'IRT',
      status: 'no_wallet',
    });
    expect(pg.transaction).not.toHaveBeenCalled();
  });

  test('converts PostgreSQL numeric balance fields to numbers', async () => {
    Wallet.findByUserAndCurrency.mockResolvedValue({
      id: 'wallet-1',
      user_id: 'user-1',
      balance: '125.50',
      available_balance: '100.25',
      frozen_balance: '25.25',
      wallet_type: 'user',
      currency_id: 'IRT',
      status: 'active',
    });

    await expect(walletService.getWalletBalance('user-1', 'IRT')).resolves.toMatchObject({
      walletId: 'wallet-1',
      balance: 125.5,
      availableBalance: 100.25,
      frozenBalance: 25.25,
      status: 'active',
    });
  });

  test.each([0, -1, NaN, Infinity, '100', null])(
    'rejects invalid deposit amount %p without opening a transaction',
    async (amount) => {
      await expect(walletService.depositFunds('user-1', amount, 'IRT'))
        .rejects.toThrow();
      expect(pg.transaction).not.toHaveBeenCalled();
    },
  );

  test('rejects a missing transaction-history user before querying transactions', async () => {
    await expect(walletService.getTransactionHistory(null)).rejects.toThrow('User ID is required');
    expect(Transaction.findByUserId).not.toHaveBeenCalled();
    expect(Transaction.countByUserId).not.toHaveBeenCalled();
  });

  test('returns transaction history and consistent pagination metadata', async () => {
    const rows = [{ id: 'tx-1' }, { id: 'tx-2' }];
    Transaction.findByUserId.mockResolvedValue(rows);
    Transaction.countByUserId.mockResolvedValue(5);

    await expect(
      walletService.getTransactionHistory('user-1', null, { limit: 2, offset: 2 }),
    ).resolves.toEqual({
      transactions: rows,
      pagination: { total: 5, limit: 2, offset: 2, hasMore: true },
    });

    expect(Transaction.findByUserId).toHaveBeenCalledWith('user-1', {
      limit: 2, offset: 2, type: null,
    });
    expect(Transaction.countByUserId).toHaveBeenCalledWith('user-1', null);
  });
});

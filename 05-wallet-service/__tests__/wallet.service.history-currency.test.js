'use strict';

jest.mock('../db/pg', () => ({ transaction: jest.fn(), query: jest.fn() }));
jest.mock('../models/wallet.model', () => ({}));
jest.mock('../models/transaction.model', () => ({
  findByUserId: jest.fn(),
  countByUserId: jest.fn(),
}));
jest.mock('../models/escrow.model', () => ({}));
jest.mock('../../14-config-system/server.config', () => ({ wallet: {}, trip: { commissionRates: {} } }));
jest.mock('../../01-core-system/EventBus', () => ({ publish: jest.fn() }));

const Transaction = require('../models/transaction.model');
const walletService = require('../services/wallet.service');

describe('wallet service transaction history currency filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Transaction.findByUserId.mockResolvedValue([]);
    Transaction.countByUserId.mockResolvedValue(0);
  });

  test('passes currency filter to both row and count queries', async () => {
    await walletService.getTransactionHistory('user-1', 'IRT', {
      limit: 10,
      offset: 20,
      type: 'CREDIT',
    });

    expect(Transaction.findByUserId).toHaveBeenCalledWith('user-1', {
      limit: 10,
      offset: 20,
      type: 'CREDIT',
      currencyId: 'IRT',
    });
    expect(Transaction.countByUserId).toHaveBeenCalledWith('user-1', 'CREDIT', 'IRT');
  });

  test('keeps currency optional for existing callers', async () => {
    await walletService.getTransactionHistory('user-1');

    expect(Transaction.findByUserId).toHaveBeenCalledWith('user-1', {
      limit: 20,
      offset: 0,
      type: null,
      currencyId: null,
    });
    expect(Transaction.countByUserId).toHaveBeenCalledWith('user-1', null, null);
  });
});

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

  test('serializes duplicate trip payments before checking the passenger reference', async () => {
    await expect(
      walletService.processTripPayment({
        tripId: 'trip-1',
        passengerId: 'passenger-1',
        driverId: 'driver-1',
        amount: 100,
        currencyId: 'IRT',
      })
    ).rejects.toThrow('Duplicate transaction');

    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['wallet-reference:trip-payment:trip-1:passenger'],
    );
    expect(mockClient.query.mock.invocationCallOrder[0])
      .toBeLessThan(Transaction.findByReferenceId.mock.invocationCallOrder[0]);
    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  test('serializes duplicate cancellation penalties before checking the passenger reference', async () => {
    await expect(
      walletService.processCancellationPenalty({
        tripId: 'trip-2',
        passengerId: 'passenger-1',
        driverId: 'driver-1',
        penaltyAmount: 25,
        currencyId: 'IRT',
      })
    ).rejects.toThrow('Duplicate transaction');

    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['wallet-reference:trip-penalty:trip-2:passenger'],
    );
    expect(mockClient.query.mock.invocationCallOrder[0])
      .toBeLessThan(Transaction.findByReferenceId.mock.invocationCallOrder[0]);
    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  test('serializes duplicate refunds before checking the refund reference', async () => {
    mockClient.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM transactions t') && sql.includes('FOR UPDATE OF t')) {
        return {
          rows: [{
            id: 'original-transaction',
            wallet_id: 'wallet-1',
            trip_id: null,
            user_id: 'user-1',
            amount: '100',
            currency_id: 'IRT',
            type: 'DEBIT',
            status: 'success',
            reference_id: 'external-debit-1',
            is_multi_party_debit: false,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(
      walletService.refundFunds('original-transaction', 'test retry')
    ).rejects.toThrow('Duplicate refund');

    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['wallet-reference:REFUND-original-transaction'],
    );
    const lockCallOrder = mockClient.query.mock.invocationCallOrder.find(
      (_, index) => mockClient.query.mock.calls[index][0].includes('pg_advisory_xact_lock(hashtextextended')
    );
    expect(lockCallOrder)
      .toBeLessThan(Transaction.findByReferenceId.mock.invocationCallOrder[0]);
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });
});

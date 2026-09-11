/**
 * releaseHold.atomic.test.js - تست واحد/یکپارچه آزادسازی اتمیک وجه (P1-2)
 *
 * پوشش:
 *  - موفقیت: frozen → available + ثبت wallet_transactions + ledger با نوع UNHOLD
 *  - استفاده از قفل ردیفی SELECT ... FOR UPDATE
 *  - اجرای اتمیک داخل pg.transaction
 *  - خطا در صورت کافی نبودن frozen_balance
 *  - Idempotency روی referenceId تکراری
 *  - اعتبارسنجی ورودی‌ها
 */

jest.mock('../db/pg', () => ({
  transaction: jest.fn(),
}));
jest.mock('../models/wallet.model', () => ({
  unfreezeFrozen: jest.fn(),
}));
jest.mock('../models/transaction.model', () => ({
  findByReferenceId: jest.fn(),
  create: jest.fn(),
  createLedgerEntry: jest.fn(),
}));
jest.mock('../../01-core-system/EventBus', () => ({
  publish: jest.fn(),
}));
jest.mock('../../14-config-system/server.config', () => ({
  trip: { commissionRates: {} },
  pg: {},
  rateLimit: { windowMs: 60000, maxRequests: 100 },
}), { virtual: false });

const pg = require('../db/pg');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const walletService = require('../services/wallet.service');

describe('releaseHold() - atomic unhold', () => {
  const userId = 'test-user-atomic-1';
  const baseWallet = {
    id: 'wallet-1',
    balance: '100000',
    available_balance: '60000',
    frozen_balance: '40000',
  };

  let capturedQueries;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedQueries = [];
    Transaction.findByReferenceId.mockResolvedValue(null);
    Transaction.create.mockImplementation(async (data) => ({ id: 'tx-1', ...data }));
    Transaction.createLedgerEntry.mockResolvedValue({ rows: [{}] });
    Wallet.unfreezeFrozen.mockImplementation(async (id, amount) => ({
      ...baseWallet,
      balance: String(parseFloat(baseWallet.balance)),
      available_balance: String(parseFloat(baseWallet.available_balance) + amount),
      frozen_balance: String(parseFloat(baseWallet.frozen_balance) - amount),
    }));
    pg.transaction.mockImplementation(async (callback) => {
      const fakeClient = {
        query: jest.fn(async (text, params) => {
          capturedQueries.push(text);
          return { rows: [{ ...baseWallet }], rowCount: 1 };
        }),
        release: jest.fn(),
      };
      const result = await callback(fakeClient);
      result.__client = fakeClient;
      return result;
    });
  });

  test('should release frozen -> available atomically with UNHOLD ledger entry', async () => {
    const result = await walletService.releaseHold({
      userId, amount: 15000, referenceType: 'trip_cancel', referenceId: null, reason: 'Trip cancelled', currencyId: 'IRT',
    });

    expect(pg.transaction).toHaveBeenCalledTimes(1);
    expect(capturedQueries.some((q) => q.includes('FOR UPDATE'))).toBe(true);
    expect(Wallet.unfreezeFrozen).toHaveBeenCalledWith('wallet-1', 15000, expect.anything());
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 'wallet-1', userId, amount: 15000, type: 'CREDIT', status: 'success' }),
      expect.anything()
    );
    expect(Transaction.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ operationType: 'UNHOLD' }),
      expect.anything()
    );
    expect(result.success).toBe(true);
    expect(result.availableBalance).toBe(75000);
    expect(result.frozenBalance).toBe(25000);
    expect(result.referenceType).toBe('trip_cancel');
  });

  test('should reject when frozen balance is insufficient', async () => {
    await expect(
      walletService.releaseHold({ userId, amount: 999999, currencyId: 'IRT' })
    ).rejects.toThrow('Insufficient frozen balance');
    expect(Wallet.unfreezeFrozen).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  test('should reject duplicate referenceId (idempotency)', async () => {
    Transaction.findByReferenceId.mockResolvedValueOnce({ id: 'existing-tx' });
    await expect(
      walletService.releaseHold({ userId, amount: 1000, referenceId: 'DUP-REF-1', currencyId: 'IRT' })
    ).rejects.toThrow("Duplicate transaction");
  });

  test('should validate inputs', async () => {
    await expect(walletService.releaseHold({ userId, amount: -5 })).rejects.toThrow();
    await expect(walletService.releaseHold({ userId: null, amount: 100 })).rejects.toThrow('User ID is required');
  });
});

/**
 * trip-completed-handler.test.js - Wallet subscriber tests for TripCompleted (P5-1)
 *
 * 1) TripCompletedHandler: subscribes to the event, delegates to the atomic
 *    walletService.processTripPayment with the commission read from Config
 *    (15% general), and never throws back to the publisher.
 * 2) processTripPayment: verifies the exact atomic money flow for a 100,000 IRT
 *    trip — passenger charged 100,000, platform gets 15,000 commission,
 *    driver gets 85,000 — and rejects insufficient funds to preserve DB constraints.
 */

jest.mock('../db/pg', () => ({
  transaction: jest.fn((cb) => cb({ query: jest.fn(() => ({ rows: [], rowCount: 0 })) })),
}));
jest.mock('../models/wallet.model', () => ({
  findByUserAndCurrency: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  debitAllowNegative: jest.fn(),
  debitAvailableBalance: jest.fn(),
  creditAvailableBalance: jest.fn(),
}));
jest.mock('../models/transaction.model', () => ({
  findByReferenceId: jest.fn(async () => null),
  create: jest.fn(async (d) => ({ id: `txn-${d.type}-${Math.random().toString(36).slice(2, 7)}`, ...d })),
  createLedgerEntry: jest.fn(async () => ({ rows: [] })),
}));
jest.mock('../../01-core-system/EventBus', () => ({
  publish: jest.fn(),
  on: jest.fn(),
  emit: jest.fn(),
}));

const pg = require('../db/pg');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const EventBus = require('../../01-core-system/EventBus');
const walletService = require('../services/wallet.service');
const { TripCompletedHandler, TRIP_COMPLETED_EVENT } = require('../handlers/trip-completed.handler');

function makeFakeBus() {
  const subs = {};
  return {
    subs,
    on: jest.fn((event, handler) => {
      subs[event] = subs[event] || [];
      subs[event].push(handler);
    }),
  };
}

describe('TripCompletedHandler (P5-1)', () => {
  test('subscribes to TripCompleted on register()', () => {
    const bus = makeFakeBus();
    const h = new TripCompletedHandler({ eventBus: bus, walletService: {} });
    h.register();
    expect(bus.on).toHaveBeenCalledWith(TRIP_COMPLETED_EVENT, expect.any(Function));
    expect(bus.subs[TRIP_COMPLETED_EVENT]).toHaveLength(1);
  });

  test('delegates to walletService.processTripPayment with commission from Config', async () => {
    const processTripPayment = jest.fn().mockResolvedValue({
      commission: 15000, driverAmount: 85000, debt: false,
      referenceId: 'trip-payment:trip-9',
      passengerTransactionId: 'pp', driverTransactionId: 'dr', platformCommissionId: 'pf',
    });
    const h = new TripCompletedHandler({ eventBus: makeFakeBus(), walletService: { processTripPayment } });

    const res = await h.handle({
      event: 'TripCompleted',
      data: { tripId: 'trip-9', passengerId: 'user-1', driverId: 'user-driver', amount: 100000, currency: 'IRT' },
    });

    expect(res).toMatchObject({ processed: true, tripId: 'trip-9', amount: 100000 });
    expect(processTripPayment).toHaveBeenCalledTimes(1);
    expect(processTripPayment).toHaveBeenCalledWith({
      tripId: 'trip-9',
      passengerId: 'user-1',
      driverId: 'user-driver',
      amount: 100000,
      currencyId: 'IRT',
      commissionRate: 15, // از Config (commisisionRates.general)
    });
  });

  test('duplicate payment is treated as success (deduped)', async () => {
    const processTripPayment = jest.fn().mockRejectedValue(
      new Error('Duplicate transaction: referenceId trip-payment:t1 already exists'),
    );
    const h = new TripCompletedHandler({ eventBus: makeFakeBus(), walletService: { processTripPayment } });
    const res = await h.handle({
      event: 'TripCompleted',
      data: { tripId: 't1', passengerId: 'u1', driverId: 'd1', amount: 50000 },
    });
    expect(res).toMatchObject({ processed: true, deduped: true });
  });

  test('missing settlement fields process nothing', async () => {
    const processTripPayment = jest.fn();
    const h = new TripCompletedHandler({ eventBus: makeFakeBus(), walletService: { processTripPayment } });
    const res = await h.handle({ event: 'TripCompleted', data: { tripId: 't2' } });
    expect(res).toMatchObject({ processed: false, reason: 'missing_settlement_fields' });
    expect(processTripPayment).not.toHaveBeenCalled();
  });

  test('payment failure never throws back to the publisher', async () => {
    const processTripPayment = jest.fn().mockRejectedValue(new Error('DB down'));
    const h = new TripCompletedHandler({ eventBus: makeFakeBus(), walletService: { processTripPayment } });
    const res = await h.handle({
      event: 'TripCompleted',
      data: { tripId: 't3', passengerId: 'u3', driverId: 'd3', amount: 90000 },
    });
    expect(res).toMatchObject({ processed: false, reason: 'payment_failed' });
  });
});
describe('walletService.processCancellationPenalty (atomic settlement)', () => {
  test('credits driver and platform through supported wallet model methods with unique ledger references', async () => {
    jest.clearAllMocks();
    const passengerWallet = { id: 'passenger-wallet', balance: '20000', available_balance: '20000', frozen_balance: '0', status: 'active' };
    const driverWallet = { id: 'driver-wallet', balance: '0', available_balance: '0', frozen_balance: '0', status: 'active' };
    const platformWallet = { id: 'platform-wallet', balance: '0', available_balance: '0', frozen_balance: '0', status: 'active' };

    Wallet.findByUserAndCurrency
      .mockResolvedValueOnce(passengerWallet)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    Wallet.create
      .mockResolvedValueOnce(driverWallet)
      .mockResolvedValueOnce(platformWallet);
    Wallet.debitAvailableBalance.mockResolvedValue({
      id: 'passenger-wallet', balance: '10000', available_balance: '10000', frozen_balance: '0',
    });
    Wallet.creditAvailableBalance
      .mockResolvedValueOnce({ id: 'driver-wallet', balance: '8000', available_balance: '8000', frozen_balance: '0' })
      .mockResolvedValueOnce({ id: 'platform-wallet', balance: '2000', available_balance: '2000', frozen_balance: '0' });
    Transaction.findByReferenceId.mockResolvedValue(null);

    const result = await walletService.processCancellationPenalty({
      tripId: 'trip-penalty-test',
      passengerId: 'passenger-1',
      driverId: 'driver-1',
      penaltyAmount: 10000,
      currencyId: 'IRT',
      driverShare: 80,
    });

    expect(result).toMatchObject({
      success: true, penaltyAmount: 10000, driverCompensation: 8000, platformShare: 2000,
    });
    expect(Wallet.creditAvailableBalance).toHaveBeenCalledTimes(2);
    expect(Transaction.findByReferenceId).toHaveBeenCalledWith(
      'trip-penalty:trip-penalty-test:passenger',
      expect.anything(),
    );
    const ledgerEntries = Transaction.createLedgerEntry.mock.calls.map((call) => call[0]);
    expect(ledgerEntries.map((entry) => entry.referenceId).sort()).toEqual([
      'trip-penalty:trip-penalty-test:driver',
      'trip-penalty:trip-penalty-test:passenger',
      'trip-penalty:trip-penalty-test:platform',
    ]);
  });
});

describe('walletService.refundFunds (atomic refund)', () => {
  test('refunds a successful debit once and publishes only after transaction callback completes', async () => {
    jest.clearAllMocks();
    const originalTx = {
      id: 'original-tx', wallet_id: 'wallet-1', trip_id: 'trip-1', user_id: 'user-1',
      amount: '2500', currency_id: 'IRT', type: 'DEBIT', status: 'success',
    };
    const wallet = {
      id: 'wallet-1', balance: '7500', available_balance: '7500', frozen_balance: '0',
      user_id: 'user-1', status: 'active',
    };
    let committed = false;
    pg.transaction.mockImplementationOnce(async (callback) => {
      const client = {
        query: jest.fn(async (sql) => (
          sql.includes('FROM transactions WHERE id = $1')
            ? { rows: [originalTx], rowCount: 1 }
            : { rows: [], rowCount: 0 }
        )),
      };
      const result = await callback(client);
      committed = true;
      return result;
    });
    Wallet.findById.mockResolvedValue(wallet);
    Wallet.creditAvailableBalance.mockResolvedValue({
      id: 'wallet-1', balance: '10000', available_balance: '10000', frozen_balance: '0',
    });
    Transaction.findByReferenceId.mockResolvedValue(null);
    EventBus.publish.mockImplementation(() => {
      expect(committed).toBe(true);
    });

    const result = await walletService.refundFunds('original-tx', 'approved refund');

    expect(result).toMatchObject({
      success: true, amount: 2500, originalTransactionId: 'original-tx',
      refundTransactionId: expect.any(String),
    });
    expect(Wallet.findById).toHaveBeenCalledWith('wallet-1', expect.anything());
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CREDIT', referenceId: 'REFUND-original-tx' }),
      expect.anything(),
    );
    expect(Transaction.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'REFUND-original-tx' }),
      expect.anything(),
    );
    expect(EventBus.publish).toHaveBeenCalledWith('WalletBalanceChanged', expect.any(Object));
  });

  test('rejects refunding a credit transaction', async () => {
    jest.clearAllMocks();
    pg.transaction.mockImplementationOnce(async (callback) => callback({
      query: jest.fn(async () => ({
        rows: [{
          id: 'credit-tx', wallet_id: 'wallet-1', user_id: 'user-1',
          amount: '2500', currency_id: 'IRT', type: 'CREDIT', status: 'success',
        }],
        rowCount: 1,
      })),
    }));

    await expect(walletService.refundFunds('credit-tx')).rejects.toThrow(
      'Only successful debit transactions can be refunded',
    );
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });
});

describe('walletService.processTripPayment (P5-1 atomic settlement)', () => {
  const pWallet = { id: 'pw', balance: '200000', available_balance: '200000', frozen_balance: '0', status: 'active' };
  const plWallet = { id: 'platw', balance: '0', available_balance: '0', frozen_balance: '0', status: 'active' };
  const dWallet = { id: 'dw', balance: '0', available_balance: '0', frozen_balance: '0', status: 'active' };

  beforeEach(() => {
    jest.clearAllMocks();
    // مسافر یافت؛ پلتفرم و راننده ساخته می‌شوند
    Wallet.findByUserAndCurrency
      .mockResolvedValueOnce(pWallet)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    Wallet.create
      .mockResolvedValueOnce(plWallet)
      .mockResolvedValueOnce(dWallet);
    Wallet.debitAvailableBalance.mockResolvedValue({ id: 'pw', balance: '100000', available_balance: '100000', frozen_balance: '0' });
    Wallet.creditAvailableBalance
      .mockResolvedValueOnce({ id: 'platw', balance: '15000', available_balance: '15000', frozen_balance: '0' })
      .mockResolvedValueOnce({ id: 'dw', balance: '85000', available_balance: '85000', frozen_balance: '0' });
    Transaction.findByReferenceId.mockResolvedValue(null);
  });

  test('100,000 IRT trip: charge 100,000 from passenger, 15,000 platform, 85,000 driver', async () => {
    const result = await walletService.processTripPayment({
      tripId: 'trip-10', passengerId: 'user-1', driverId: 'user-driver', amount: 100000, currencyId: 'IRT',
    });

    expect(result).toMatchObject({ success: true, amount: 100000, commission: 15000, driverAmount: 85000, debt: false });

    expect(Wallet.debitAvailableBalance).toHaveBeenCalledWith('pw', 100000, expect.anything());
    expect(Wallet.creditAvailableBalance).toHaveBeenCalledWith('platw', 15000, expect.anything());
    expect(Wallet.creditAvailableBalance).toHaveBeenCalledWith('dw', 85000, expect.anything());

    const txs = Transaction.create.mock.calls.map((c) => c[0]);
    expect(txs.some((t) => t.type === 'DEBIT' && t.amount === 100000 && t.description.includes('TRIP_PAYMENT'))).toBe(true);
    expect(txs.some((t) => t.type === 'CREDIT' && t.amount === 15000 && t.description.includes('TRIP_COMMISSION'))).toBe(true);
    expect(txs.some((t) => t.type === 'CREDIT' && t.amount === 85000 && t.description.includes('TRIP_REVENUE'))).toBe(true);

    // Every transaction has a distinct reference, matching the DB unique index.
    expect(txs.map((t) => t.referenceId).sort()).toEqual([
      'trip-payment:trip-10:driver',
      'trip-payment:trip-10:passenger',
      'trip-payment:trip-10:platform',
    ]);
    expect(Transaction.findByReferenceId).toHaveBeenCalledWith(
      'trip-payment:trip-10:passenger',
      expect.anything(),
    );

    // Ledger references are also unique because migration 005 enforces uniqueness.
    const ledgerEntries = Transaction.createLedgerEntry.mock.calls.map((call) => call[0]);
    expect(ledgerEntries.map((entry) => entry.referenceId).sort()).toEqual([
      'trip-payment:trip-10:driver',
      'trip-payment:trip-10:passenger',
      'trip-payment:trip-10:platform',
    ]);
  });

  test('insufficient passenger balance is rejected without creating a negative wallet balance', async () => {
    Wallet.debitAvailableBalance.mockResolvedValueOnce(null);

    await expect(walletService.processTripPayment({
      tripId: 'trip-11', passengerId: 'user-1', driverId: 'user-driver', amount: 100000, currencyId: 'IRT',
    })).rejects.toThrow('Insufficient available balance');

    expect(Transaction.create).not.toHaveBeenCalled();
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
  });

  test('rejects duplicate payment (idempotency) for the same trip', async () => {
    Transaction.findByReferenceId.mockResolvedValue({ id: 'existing' });
    await expect(
      walletService.processTripPayment({ tripId: 'trip-12', passengerId: 'u1', driverId: 'd1', amount: 50000 })
    ).rejects.toThrow('Duplicate transaction');
    expect(Transaction.findByReferenceId).toHaveBeenCalledWith(
      'trip-payment:trip-12:passenger',
      expect.anything(),
    );
    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
  });

  test('rejects commission rates outside the valid percentage range', async () => {
    await expect(
      walletService.processTripPayment({
        tripId: 'trip-13', passengerId: 'u1', driverId: 'd1', amount: 50000, commissionRate: 150,
      }),
    ).rejects.toThrow('Commission rate must be a finite number between 0 and 100');
    expect(pg.transaction).not.toHaveBeenCalled();
  });
});
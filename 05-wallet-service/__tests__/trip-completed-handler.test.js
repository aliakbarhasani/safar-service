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
  findByTypeAndCurrency: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  debitAllowNegative: jest.fn(),
  debitAvailableBalance: jest.fn(),
  creditAvailableBalance: jest.fn(),
  freezeAvailable: jest.fn(),
  unfreezeFrozen: jest.fn(),
  deductFrozen: jest.fn(),
}));
jest.mock('../models/escrow.model', () => ({
  findById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
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
const Escrow = require('../models/escrow.model');
const EventBus = require('../../01-core-system/EventBus');
const walletService = require('../services/wallet.service');
const config = require('../../14-config-system/server.config');
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
describe('walletService.releaseEscrowFull (atomic escrow release)', () => {
  test('records payer, payee and platform transactions/ledger entries and publishes only after commit', async () => {
    let committed = false;
    const sourceWallet = {
      id: 'source-wallet', user_id: 'payer-1', wallet_type: 'user', status: 'active',
      balance: '10000', available_balance: '0', frozen_balance: '10000',
    };
    const payeeWallet = {
      id: 'payee-wallet', user_id: 'payee-1', wallet_type: 'user', status: 'active',
      balance: '0', available_balance: '0', frozen_balance: '0',
    };
    const platformWallet = {
      id: 'platform-wallet', user_id: null, wallet_type: 'platform', status: 'active',
      balance: '0', available_balance: '0', frozen_balance: '0',
    };
    const updatedSource = { ...sourceWallet, balance: '0', frozen_balance: '0' };
    const updatedPayee = { ...payeeWallet, balance: '9000', available_balance: '9000' };
    const updatedPlatform = { ...platformWallet, balance: '1000', available_balance: '1000' };

    pg.transaction.mockImplementationOnce(async (callback) => {
      const result = await callback({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) });
      committed = true;
      return result;
    });
    Escrow.findById.mockResolvedValue({
      id: 'escrow-1', status: 'active', trip_id: 'trip-1', payer_id: 'payer-1', payee_id: 'payee-1',
      amount: '10000', platform_commission: '1000', net_amount: '9000',
      currency_id: 'currency-uuid', source_wallet_id: 'source-wallet', platform_wallet_id: 'platform-wallet',
    });
    Escrow.updateStatus.mockResolvedValue({ id: 'escrow-1', status: 'released' });
    Wallet.findById.mockReset().mockResolvedValueOnce(sourceWallet).mockResolvedValueOnce(platformWallet);
    Wallet.findByUserAndCurrency.mockReset().mockResolvedValue(payeeWallet);
    Wallet.deductFrozen.mockReset().mockResolvedValue(updatedSource);
    Wallet.creditAvailableBalance.mockReset()
      .mockResolvedValueOnce(updatedPayee)
      .mockResolvedValueOnce(updatedPlatform);
    Transaction.create.mockReset().mockImplementation(async (data) => ({ id: `tx-${data.referenceId}`, ...data }));
    Transaction.createLedgerEntry.mockReset().mockResolvedValue({ rows: [] });
    EventBus.publish.mockClear().mockImplementation(() => {
      expect(committed).toBe(true);
    });

    const result = await walletService.releaseEscrowFull('escrow-1');

    expect(result).toMatchObject({
      success: true, escrowId: 'escrow-1', status: 'released', platformCommission: 1000,
      transactionIds: {
        escrow: 'tx-escrow-release:escrow-1:payer',
        recipient: 'tx-escrow-release:escrow-1:payee',
        platformCommission: 'tx-escrow-release:escrow-1:platform',
      },
    });
    expect(Wallet.creditAvailableBalance).toHaveBeenNthCalledWith(1, 'payee-wallet', 9000, expect.anything());
    expect(Wallet.creditAvailableBalance).toHaveBeenNthCalledWith(2, 'platform-wallet', 1000, expect.anything());
    expect(Escrow.updateStatus).toHaveBeenCalledWith(
      'escrow-1', 'released', { destination_wallet_id: 'payee-wallet' }, expect.anything(),
    );
    const ledgerEntries = Transaction.createLedgerEntry.mock.calls.map((call) => call[0]);
    expect(ledgerEntries.map((entry) => entry.referenceId).sort()).toEqual([
      'escrow-release:escrow-1:payee',
      'escrow-release:escrow-1:payer',
      'escrow-release:escrow-1:platform',
    ]);
    expect(EventBus.publish).toHaveBeenCalledWith('EscrowReleased', expect.objectContaining({ escrowId: 'escrow-1' }));
    expect(EventBus.publish).toHaveBeenCalledTimes(4); // 3 balance events + EscrowReleased
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
      .mockResolvedValueOnce(null);
    Wallet.findByTypeAndCurrency.mockResolvedValue(platformWallet);
    Wallet.create.mockResolvedValueOnce(driverWallet);
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
    expect(EventBus.publish).toHaveBeenCalledTimes(3);
    expect(EventBus.publish).toHaveBeenCalledWith('WalletBalanceChanged', expect.objectContaining({
      walletId: 'platform-wallet', userId: null, amount: 2000, type: 'CREDIT',
    }));
  });

  test('rejects cancellation penalty when passenger balance is insufficient', async () => {
    jest.clearAllMocks();
    Wallet.findByUserAndCurrency.mockResolvedValueOnce({
      id: 'passenger-wallet', balance: '1000', available_balance: '1000',
      frozen_balance: '0', status: 'active',
    });
    Wallet.debitAvailableBalance.mockResolvedValueOnce(null);
    Transaction.findByReferenceId.mockResolvedValue(null);

    await expect(walletService.processCancellationPenalty({
      tripId: 'trip-penalty-insufficient',
      passengerId: 'passenger-1',
      driverId: 'driver-1',
      penaltyAmount: 10000,
      currencyId: 'IRT',
    })).rejects.toThrow('Insufficient available balance');

    expect(Transaction.create).not.toHaveBeenCalled();
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
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

  test('allocates the full penalty to the platform when no driver is assigned', async () => {
    jest.clearAllMocks();
    Wallet.findByUserAndCurrency.mockResolvedValueOnce({
      id: 'passenger-wallet', balance: '20000', available_balance: '20000',
      frozen_balance: '0', status: 'active',
    });
    Wallet.findByTypeAndCurrency.mockResolvedValue({
      id: 'platform-wallet', balance: '0', available_balance: '0',
      frozen_balance: '0', status: 'active',
    });
    Wallet.debitAvailableBalance.mockResolvedValue({
      id: 'passenger-wallet', balance: '10000', available_balance: '10000', frozen_balance: '0',
    });
    Wallet.creditAvailableBalance.mockResolvedValue({
      id: 'platform-wallet', balance: '10000', available_balance: '10000', frozen_balance: '0',
    });
    Transaction.findByReferenceId.mockResolvedValue(null);

    const result = await walletService.processCancellationPenalty({
      tripId: 'trip-no-driver', passengerId: 'passenger-1', penaltyAmount: 10000,
      currencyId: 'IRT', driverShare: 80,
    });

    expect(result).toMatchObject({
      success: true, driverCompensation: 0, platformShare: 10000, driverCompensationId: null,
    });
    expect(Wallet.creditAvailableBalance).toHaveBeenCalledTimes(1);
    expect(Wallet.creditAvailableBalance).toHaveBeenCalledWith('platform-wallet', 10000, expect.anything());
    expect(Wallet.findByTypeAndCurrency).toHaveBeenCalledWith('platform', 'IRT', expect.anything());
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

describe('walletService.createEscrow (server-side commission)', () => {
  test('ignores caller-supplied commission and derives it from trusted config', async () => {
    jest.clearAllMocks();
    const amount = 100000;
    const rate = Number(config.trip.commissionRates.intercity_taxi);
    const expectedCommission = Number((amount * rate / 100).toFixed(8));
    const payerWallet = {
      id: 'payer-wallet', balance: '150000', available_balance: '150000',
      frozen_balance: '0', status: 'active',
    };
    Wallet.findByUserAndCurrency.mockResolvedValue(payerWallet);
    Wallet.freezeAvailable.mockResolvedValue({
      id: 'payer-wallet', balance: '150000', available_balance: '50000',
      frozen_balance: '100000', status: 'active',
    });
    Wallet.findByTypeAndCurrency.mockResolvedValue({
      id: 'platform-wallet', wallet_type: 'platform', status: 'active',
    });
    Escrow.create.mockResolvedValue({ id: 'escrow-config-test', status: 'active' });

    const result = await walletService.createEscrow({
      payerId: 'payer-1',
      payeeId: 'driver-1',
      amount,
      currencyId: 'IRT',
      tripId: 'trip-config-test',
      serviceType: 'intercity_taxi',
      platformCommission: 1,
    });

    expect(result.platformCommission).toBe(expectedCommission);
    expect(result.netAmount).toBe(Number((amount - expectedCommission).toFixed(8)));
    expect(result.platformCommission).not.toBe(1);
    expect(Escrow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount,
        platformCommission: expectedCommission,
        netAmount: Number((amount - expectedCommission).toFixed(8)),
        platformWalletId: 'platform-wallet',
      }),
      expect.anything(),
    );
  });
});

describe('walletService.processTripPayment (P5-1 atomic settlement)', () => {
  const pWallet = { id: 'pw', balance: '200000', available_balance: '200000', frozen_balance: '0', status: 'active' };
  const plWallet = { id: 'platw', balance: '0', available_balance: '0', frozen_balance: '0', status: 'active' };
  const dWallet = { id: 'dw', balance: '0', available_balance: '0', frozen_balance: '0', status: 'active' };

  beforeEach(() => {
    // Clear queued one-time mock results from earlier describe blocks too.
    Wallet.findByUserAndCurrency.mockReset();
    Wallet.findByTypeAndCurrency.mockReset();
    Wallet.create.mockReset();
    Wallet.debitAvailableBalance.mockReset();
    Wallet.creditAvailableBalance.mockReset();
    Transaction.findByReferenceId.mockReset();
    Transaction.create.mockReset().mockImplementation(async (data) => ({ id: `txn-${data.type}-test`, ...data }));
    Transaction.createLedgerEntry.mockReset().mockResolvedValue({ rows: [] });
    pg.transaction.mockClear();
    EventBus.publish.mockClear();
    // مسافر یافت؛ پلتفرم و راننده ساخته می‌شوند
    Wallet.findByUserAndCurrency
      .mockResolvedValueOnce(pWallet)
      .mockResolvedValueOnce(null);
    Wallet.findByTypeAndCurrency.mockResolvedValue(plWallet);
    Wallet.create.mockResolvedValueOnce(dWallet);
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
    expect(Wallet.findByTypeAndCurrency).toHaveBeenCalledWith('platform', 'IRT', expect.anything());
    expect(txs.find((t) => t.description.includes('TRIP_COMMISSION')).userId).toBeNull();
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
    expect(EventBus.publish).toHaveBeenCalledTimes(3);
    expect(EventBus.publish).toHaveBeenCalledWith('WalletBalanceChanged', expect.objectContaining({
      walletId: 'platw', userId: null, amount: 15000, type: 'CREDIT',
    }));
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
    ).rejects.toThrow('Commission rate must be a finite number greater than or equal to 0 and less than 100');
    expect(pg.transaction).not.toHaveBeenCalled();

    await expect(walletService.processTripPayment({
      tripId: 'trip-14', passengerId: 'u1', driverId: 'd1', amount: 50000, commissionRate: 100,
    })).rejects.toThrow('Commission rate must be a finite number greater than or equal to 0 and less than 100');
    expect(pg.transaction).not.toHaveBeenCalled();
  });
});
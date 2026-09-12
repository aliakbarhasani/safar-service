/**
 * trip-completed-handler.test.js - Wallet subscriber tests for TripCompleted (P5-1)
 *
 * 1) TripCompletedHandler: subscribes to the event, delegates to the atomic
 *    walletService.processTripPayment with the commission read from Config
 *    (15% general), and never throws back to the publisher.
 * 2) processTripPayment: verifies the exact atomic money flow for a 100,000 IRT
 *    trip — passenger charged 100,000, platform gets 15,000 commission,
 *    driver gets 85,000 — plus the debt path when the passenger is short.
 */

jest.mock('../db/pg', () => ({
  transaction: jest.fn((cb) => cb({ query: jest.fn(() => ({ rows: [], rowCount: 0 })) })),
}));
jest.mock('../models/wallet.model', () => ({
  findByUserAndCurrency: jest.fn(),
  create: jest.fn(),
  debitAllowNegative: jest.fn(),
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

const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
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
    Wallet.debitAllowNegative.mockResolvedValue({ id: 'pw', balance: '100000', available_balance: '100000', frozen_balance: '0' });
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

    expect(Wallet.debitAllowNegative).toHaveBeenCalledWith('pw', 100000, expect.anything());
    expect(Wallet.creditAvailableBalance).toHaveBeenCalledWith('platw', 15000, expect.anything());
    expect(Wallet.creditAvailableBalance).toHaveBeenCalledWith('dw', 85000, expect.anything());

    const txs = Transaction.create.mock.calls.map((c) => c[0]);
    expect(txs.some((t) => t.type === 'DEBIT' && t.amount === 100000 && t.description.includes('TRIP_PAYMENT'))).toBe(true);
    expect(txs.some((t) => t.type === 'CREDIT' && t.amount === 15000 && t.description.includes('TRIP_COMMISSION'))).toBe(true);
    expect(txs.some((t) => t.type === 'CREDIT' && t.amount === 85000 && t.description.includes('TRIP_REVENUE'))).toBe(true);
  });

  test('insufficient passenger balance produces debt (negative balance)', async () => {
    Wallet.debitAllowNegative.mockResolvedValue({ id: 'pw', balance: '-50000', available_balance: '-50000', frozen_balance: '0' });

    const result = await walletService.processTripPayment({
      tripId: 'trip-11', passengerId: 'user-1', driverId: 'user-driver', amount: 100000, currencyId: 'IRT',
    });

    expect(result).toMatchObject({ success: true, debt: true, commission: 15000, driverAmount: 85000 });
    const txs = Transaction.create.mock.calls.map((c) => c[0]);
    const passengerTx = txs.find((t) => t.type === 'DEBIT');
    expect(passengerTx).toMatchObject({ status: 'pending', description: expect.stringContaining('TRIP_PAYMENT') });
  });

  test('rejects duplicate payment (idempotency) for the same trip', async () => {
    Transaction.findByReferenceId.mockResolvedValue({ id: 'existing' });
    await expect(
      walletService.processTripPayment({ tripId: 'trip-12', passengerId: 'u1', driverId: 'd1', amount: 50000 })
    ).rejects.toThrow('Duplicate transaction');
    expect(Wallet.debitAllowNegative).not.toHaveBeenCalled();
  });
});
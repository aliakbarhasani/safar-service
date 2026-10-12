'use strict';

const mockClient = { query: jest.fn() };

jest.mock('../db/pg', () => ({
  transaction: jest.fn((callback) => callback(mockClient)),
}));
jest.mock('../models/wallet.model', () => ({
  findByUserAndCurrency: jest.fn(),
  create: jest.fn(),
  debitAvailableBalance: jest.fn(),
  creditAvailableBalance: jest.fn(),
}));
jest.mock('../models/transaction.model', () => ({
  create: jest.fn(),
  createLedgerEntry: jest.fn(),
}));
jest.mock('../models/escrow.model', () => ({}));
jest.mock('../../14-config-system/server.config', () => ({ wallet: {}, trip: {} }));
jest.mock('../../01-core-system/EventBus', () => ({ publish: jest.fn() }));

const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const eventBus = require('../../01-core-system/EventBus');
const walletService = require('../services/wallet.service');

const senderId = 'sender-uuid';
const receiverId = 'receiver-uuid';
const referenceId = 'wallet-transfer:sender-uuid:retry-0001';
const senderReferenceId = referenceId + ':sender';
const receiverReferenceId = referenceId + ':receiver';

function existingRows(overrides = {}) {
  return [
    {
      id: 'debit-tx-1', wallet_id: 'wallet-sender', user_id: senderId,
      amount: '100.00000000', currency_id: 'currency-irt', currency_code: 'IRT',
      type: 'DEBIT', status: 'success',
      description: `Transfer to user ${receiverId}`,
      reference_id: senderReferenceId, ledger_id: 'ledger-sender',
      balance_after: '900.00000000', available_after: '900.00000000', frozen_after: '0.00000000',
      ...overrides.sender,
    },
    {
      id: 'credit-tx-1', wallet_id: 'wallet-receiver', user_id: receiverId,
      amount: '100.00000000', currency_id: 'currency-irt', currency_code: 'IRT',
      type: 'CREDIT', status: 'success',
      description: `Transfer from user ${senderId}`,
      reference_id: receiverReferenceId, ledger_id: 'ledger-receiver',
      balance_after: '300.00000000', available_after: '300.00000000', frozen_after: '0.00000000',
      ...overrides.receiver,
    },
  ];
}

function setupLookup(rows) {
  mockClient.query.mockImplementation(async (sql) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('FROM transactions t')) return { rows };
    return { rows: [] };
  });
}

describe('wallet transfer idempotency replay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupLookup([]);
  });

  test('locks the reference and replays the original successful result without moving balances again', async () => {
    setupLookup(existingRows());

    const result = await walletService.transferFunds(
      senderId, receiverId, 100, 'IRT', '', referenceId
    );

    expect(mockClient.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(mockClient.query.mock.calls[0][1]).toEqual([`wallet-transfer:${referenceId}`]);
    expect(result.success).toBe(true);
    expect(result.sender.transactionId).toBe('debit-tx-1');
    expect(result.sender.balance).toBe(900);
    expect(result.receiver.transactionId).toBe('credit-tx-1');
    expect(result.receiver.balance).toBe(300);
    expect(result.amount).toBe(100);
    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
    expect(Transaction.createLedgerEntry).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  test('rejects reuse of the same key with a different amount before any wallet mutation', async () => {
    setupLookup(existingRows());

    await expect(walletService.transferFunds(
      senderId, receiverId, 200, 'IRT', '', referenceId
    )).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');

    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  test('fails closed if only one side of the transfer exists', async () => {
    setupLookup(existingRows().slice(0, 1));

    await expect(walletService.transferFunds(
      senderId, receiverId, 100, 'IRT', '', referenceId
    )).rejects.toThrow('IDEMPOTENCY_STATE_INCOMPLETE');

    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
  });

  test('fails closed if a successful transaction is missing its immutable ledger entry', async () => {
    const rows = existingRows();
    rows[1].ledger_id = null;
    setupLookup(rows);

    await expect(walletService.transferFunds(
      senderId, receiverId, 100, 'IRT', '', referenceId
    )).rejects.toThrow('IDEMPOTENCY_LEDGER_INCOMPLETE');

    expect(Wallet.debitAvailableBalance).not.toHaveBeenCalled();
    expect(Wallet.creditAvailableBalance).not.toHaveBeenCalled();
  });
});

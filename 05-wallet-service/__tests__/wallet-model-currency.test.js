/**
 * Currency code/UUID compatibility tests for the wallet data-access layer.
 * The service API accepts ISO-like codes (e.g. IRT), while PostgreSQL stores
 * currencies.id UUID foreign keys. These tests guard the translation boundary.
 */
jest.mock('../db/pg', () => ({ query: jest.fn() }));

const pg = require('../db/pg');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const Escrow = require('../models/escrow.model');

function makeClient(rows = []) {
  return { query: jest.fn().mockResolvedValue({ rows, rowCount: rows.length }) };
}

describe('wallet currency database mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  test('findByUserAndCurrency resolves a currency code through currencies', async () => {
    const wallet = { id: 'wallet-1', user_id: 'user-1', currency_id: 'currency-uuid', wallet_type: 'user' };
    const client = makeClient([wallet]);

    await expect(Wallet.findByUserAndCurrency('user-1', 'IRT', client)).resolves.toEqual(wallet);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN currencies c ON c.id = w.currency_id'),
      ['user-1', 'IRT'],
    );
    expect(client.query.mock.calls[0][0]).toContain('c.code = $2 OR c.id::text = $2');
  });

  test('create maps a currency code to the currencies UUID in the INSERT', async () => {
    const wallet = { id: 'wallet-2', user_id: 'user-2', currency_id: 'currency-uuid', wallet_type: 'user' };
    const client = makeClient([wallet]);

    await expect(Wallet.create({ userId: 'user-2', currencyId: 'IRT' }, client)).resolves.toEqual(wallet);

    expect(client.query.mock.calls[0][0]).toContain('SELECT $1, c.id, $3, $4, $5, $6, $7');
    expect(client.query.mock.calls[0][1]).toEqual(['user-2', 'IRT', 'user', 0, 0, 0, 'active']);
  });

  test('platform wallet lookup selects the system wallet and locks it in the transaction', async () => {
    const wallet = { id: 'platform-wallet', user_id: null, currency_id: 'currency-uuid', wallet_type: 'platform' };
    const client = makeClient([wallet]);

    await expect(Wallet.findByTypeAndCurrency('platform', 'IRT', client)).resolves.toEqual(wallet);

    expect(client.query.mock.calls[0][0]).toContain("w.wallet_type = $1");
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE OF w');
    expect(client.query.mock.calls[0][1]).toEqual(['platform', 'IRT']);
  });

  test('transaction and ledger inserts resolve currency codes to currency UUIDs', async () => {
    const client = makeClient([{ id: 'transaction-1', currency_id: 'currency-uuid' }]);

    await Transaction.create({
      walletId: 'wallet-1', userId: 'user-1', amount: 2500,
      currencyId: 'IRT', type: 'CREDIT', referenceId: 'test-credit',
    }, client);
    await Transaction.createLedgerEntry({
      walletId: 'wallet-1', transactionId: 'transaction-1',
      creditAmount: 2500, debitAmount: 0, currencyId: 'IRT',
      balanceBefore: 0, balanceAfter: 2500,
      availableBefore: 0, availableAfter: 2500,
      frozenBefore: 0, frozenAfter: 0,
      operationType: 'test', referenceId: 'test-credit',
    }, client);

    expect(client.query.mock.calls[0][0]).toContain('FROM currencies c');
    expect(client.query.mock.calls[0][1][4]).toBe('IRT');
    expect(client.query.mock.calls[1][0]).toContain('FROM currencies c');
    expect(client.query.mock.calls[1][1][4]).toBe('IRT');
  });

  test('escrow creation resolves a currency code to its UUID', async () => {
    const client = makeClient([{ id: 'escrow-1', currency_id: 'currency-uuid' }]);

    await expect(Escrow.create({
      tripId: 'trip-1', payerId: 'user-1', payeeId: 'driver-1',
      amount: 10000, currencyId: 'IRT', platformCommission: 1000, netAmount: 9000,
      sourceWalletId: 'wallet-1',
    }, client)).resolves.toMatchObject({ id: 'escrow-1', currency_id: 'currency-uuid' });

    expect(client.query.mock.calls[0][0]).toContain('FROM currencies c');
    expect(client.query.mock.calls[0][1][4]).toBe('IRT');
  });

  test('unknown currency is rejected rather than silently returning an empty row', async () => {
    const client = makeClient([]);
    await expect(Wallet.create({ userId: 'user-3', currencyId: 'NOPE' }, client))
      .rejects.toThrow('Unknown currency code or ID: NOPE');
  });
});

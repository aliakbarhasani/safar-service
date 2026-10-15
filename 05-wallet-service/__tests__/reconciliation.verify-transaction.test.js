'use strict';

const mockQuery = jest.fn();

jest.mock('../db/pg', () => ({ query: (...args) => mockQuery(...args) }));

const reconciliation = require('../jobs/reconciliation.job');

const matchingLedgerRow = () => ({
  id: 'tx-1',
  wallet_id: 'wallet-1',
  currency_id: 'currency-1',
  amount: '10.00000000',
  type: 'CREDIT',
  status: 'success',
  ledger_id: 'ledger-1',
  ledger_wallet_id: 'wallet-1',
  ledger_currency_id: 'currency-1',
  credit_amount: '10.00000000',
  debit_amount: '0.00000000',
  ledger_balance_before: '2.00000000',
  ledger_balance: '12.00000000',
});

describe('verifyTransaction ledger consistency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns not_found when the transaction does not exist', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await expect(reconciliation.verifyTransaction('missing')).resolves.toMatchObject({
      status: 'not_found',
    });
  });

  test('does not certify a transaction with no ledger row', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...matchingLedgerRow(), ledger_id: null }] });

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'warning',
      message: 'Transaction exists but has no ledger entry',
    });
  });

  test('does not certify a linked row when its amount is wrong', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ...matchingLedgerRow(), credit_amount: '9.00000000', ledger_balance: '11.00000000' }],
    });

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'mismatch',
      checks: { directionMatches: false },
    });
  });

  test('does not certify a linked row when wallet or currency differs', async () => {
    mockQuery.mockResolvedValue([{
      rows: [{
        ...matchingLedgerRow(),
        ledger_wallet_id: 'wallet-2',
        ledger_currency_id: 'currency-2',
      }],
    }][0]);

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'mismatch',
      checks: { walletMatches: false, currencyMatches: false },
    });
  });

  test('does not certify an inconsistent ledger balance delta', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ...matchingLedgerRow(), ledger_balance: '13.00000000' }],
    });

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'mismatch',
      checks: { balanceDeltaMatches: false },
    });
  });

  test('does not certify ambiguous multiple ledger rows', async () => {
    const row = matchingLedgerRow();
    mockQuery.mockResolvedValue({ rows: [row, { ...row, ledger_id: 'ledger-2' }] });

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'warning',
      message: 'Transaction has multiple ledger entries; automatic verification is ambiguous',
    });
  });

  test('verifies only when transaction and ledger values agree exactly', async () => {
    mockQuery.mockResolvedValue({ rows: [matchingLedgerRow()] });

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'verified',
      message: 'Transaction amount, direction, wallet, currency, and ledger balance delta match',
    });
  });

  test('compares large monetary values without JavaScript floating-point rounding', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        ...matchingLedgerRow(),
        amount: '9007199254740993.00000000',
        credit_amount: '9007199254740993.00000000',
        debit_amount: '0.00000000',
        ledger_balance_before: '0.00000000',
        ledger_balance: '9007199254740993.00000000',
      }],
    });

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'verified',
    });
  });

  test('does not certify non-successful transactions', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...matchingLedgerRow(), status: 'failed' }] });

    await expect(reconciliation.verifyTransaction('tx-1')).resolves.toMatchObject({
      status: 'warning',
      message: 'Transaction is not successful; ledger consistency was not certified',
    });
  });
});

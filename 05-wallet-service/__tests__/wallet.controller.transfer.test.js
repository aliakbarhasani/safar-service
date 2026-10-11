'use strict';

jest.mock('../services/wallet.service', () => ({
  transferFunds: jest.fn(),
}));

const walletService = require('../services/wallet.service');
const { transfer } = require('../controllers/wallet.controller');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('wallet transfer controller idempotency key', () => {
  beforeEach(() => jest.clearAllMocks());

  test('requires a stable idempotency key before starting a transfer', async () => {
    const res = response();
    await transfer({ user: { userId: 'sender-1' }, headers: {}, body: { receiverId: 'receiver-1', amount: 100 } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(walletService.transferFunds).not.toHaveBeenCalled();
  });

  test('passes a sender-scoped operation key into the atomic wallet service', async () => {
    walletService.transferFunds.mockResolvedValue({ success: true, referenceId: 'wallet-transfer:sender-1:request-0001' });
    const res = response();
    await transfer({
      user: { userId: 'sender-1' },
      headers: { 'idempotency-key': 'request-0001' },
      body: { receiverId: 'receiver-1', amount: 100, currency: 'IRT' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(walletService.transferFunds).toHaveBeenCalledWith(
      'sender-1', 'receiver-1', 100, 'IRT', '', 'wallet-transfer:sender-1:request-0001',
    );
  });

  test('accepts a body referenceId when the header is absent', async () => {
    walletService.transferFunds.mockResolvedValue({ success: true });
    const res = response();
    await transfer({
      user: { id: 'sender-2' }, headers: {},
      body: { receiverId: 'receiver-2', amount: 250, referenceId: 'body-key-0002' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(walletService.transferFunds).toHaveBeenCalledWith(
      'sender-2', 'receiver-2', 250, 'IRT', '', 'wallet-transfer:sender-2:body-key-0002',
    );
  });

  test('returns conflict for a duplicate reference rather than suggesting a new transfer', async () => {
    walletService.transferFunds.mockRejectedValue(new Error("Duplicate transaction: referenceId 'wallet-transfer:sender-1:request-0001' already exists"));
    const res = response();
    await transfer({
      user: { userId: 'sender-1' }, headers: { 'idempotency-key': 'request-0001' },
      body: { receiverId: 'receiver-1', amount: 100 },
    }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

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

describe('wallet transfer idempotency API', () => {
  beforeEach(() => jest.clearAllMocks());

  test('requires a bounded idempotency key before invoking the wallet service', async () => {
    const res = response();
    await transfer({
      user: { userId: 'sender-1' },
      headers: {},
      body: { receiverId: 'receiver-1', amount: 100 },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(walletService.transferFunds).not.toHaveBeenCalled();
  });

  test('passes a sender-scoped key that fits the database reference column', async () => {
    walletService.transferFunds.mockResolvedValue({ success: true, referenceId: 'done' });
    const res = response();
    await transfer({
      user: { userId: 'sender-1' },
      headers: { 'idempotency-key': 'retry-0001' },
      body: { receiverId: 'receiver-1', amount: 100, currency: 'IRT' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(walletService.transferFunds).toHaveBeenCalledWith(
      'sender-1', 'receiver-1', 100, 'IRT', '', 'wallet-transfer:sender-1:retry-0001',
    );
  });

  test('returns HTTP 409 when the same key is reused with a different payload', async () => {
    walletService.transferFunds.mockRejectedValue(
      new Error('IDEMPOTENCY_KEY_REUSED: payload differs')
    );
    const res = response();
    await transfer({
      user: { userId: 'sender-1' },
      headers: { 'idempotency-key': 'retry-0001' },
      body: { receiverId: 'receiver-1', amount: 100, currency: 'IRT' },
    }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  test('rejects keys that would exceed the database reference limit', async () => {
    const res = response();
    await transfer({
      user: { userId: 'sender-12345678-1234-1234-1234-123456789012' },
      headers: { 'idempotency-key': 'a'.repeat(65) },
      body: { receiverId: 'receiver-1', amount: 100 },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(walletService.transferFunds).not.toHaveBeenCalled();
  });
});

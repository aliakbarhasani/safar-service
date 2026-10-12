'use strict';

jest.mock('../services/wallet.service', () => ({
  releaseEscrow: jest.fn(),
  releaseEscrowFull: jest.fn(),
}));

const walletService = require('../services/wallet.service');
const { releaseEscrow } = require('../controllers/wallet.controller');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('wallet escrow release controller security', () => {
  beforeEach(() => jest.clearAllMocks());

  test('requires an escrow record ID', async () => {
    const res = response();
    await releaseEscrow({
      body: { recipientId: 'attacker-selected-recipient', escrowWalletId: 'wallet-1' },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('ESCROW_ID_REQUIRED');
    expect(walletService.releaseEscrowFull).not.toHaveBeenCalled();
    expect(walletService.releaseEscrow).not.toHaveBeenCalled();
  });

  test('uses database escrow lifecycle and ignores caller-selected recipient and amount', async () => {
    walletService.releaseEscrowFull.mockResolvedValue({
      success: true, escrowId: 'escrow-1', status: 'released',
    });
    const res = response();
    await releaseEscrow({
      body: {
        escrowId: 'escrow-1',
        recipientId: 'attacker-selected-recipient',
        escrowWalletId: 'wallet-1',
        amount: 1,
        currency: 'USD',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(walletService.releaseEscrowFull).toHaveBeenCalledWith('escrow-1');
    expect(walletService.releaseEscrow).not.toHaveBeenCalled();
  });

  test('returns conflict when escrow is no longer active', async () => {
    walletService.releaseEscrowFull.mockRejectedValue(new Error("Escrow is released, not 'active'"));
    const res = response();
    await releaseEscrow({ body: { escrowId: 'escrow-1' } }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ESCROW_STATE_INVALID');
  });

  test('treats a missing source wallet as an escrow integrity conflict, not missing escrow', async () => {
    walletService.releaseEscrowFull.mockRejectedValue(new Error('Source wallet not found'));
    const res = response();
    await releaseEscrow({ body: { escrowId: 'escrow-1' } }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ESCROW_STATE_INVALID');
    expect(res.body.error).not.toContain('Source wallet');
  });

  test('hides unexpected internal errors and returns a server error', async () => {
    walletService.releaseEscrowFull.mockRejectedValue(new Error('database connection password detail'));
    const res = response();
    await releaseEscrow({ body: { escrowId: 'escrow-1' } }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('ESCROW_RELEASE_FAILED');
    expect(res.body.error).not.toContain('password');
  });

  test('returns not found for an unknown escrow record', async () => {
    walletService.releaseEscrowFull.mockRejectedValue(new Error('Escrow not found: missing'));
    const res = response();
    await releaseEscrow({ body: { escrowId: 'missing' } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('ESCROW_NOT_FOUND');
    expect(res.body.error).toBe('Escrow not found');
  });
});

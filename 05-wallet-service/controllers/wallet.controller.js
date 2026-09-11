/**
 * wallet.controller.js - کنترلر کیف پول (PostgreSQL)
 * 
 * معماری: این کنترلر کاملاً مستقل از منطق تجاری است
 * و فقط درخواست‌های HTTP را به سرویس مپ می‌کند.
 * 
 * مسیرها:
 *   GET    /balance?currency=IRT
 *   POST   /deposit
 *   POST   /withdraw
 *   POST   /transfer
 *   POST   /freeze
 *   POST   /escrow/release
 *   POST   /refund
 *   GET    /transactions
 */

const walletService = require('../services/wallet.service');

/**
 * دریافت موجودی کیف پول کاربر جاری
 * GET /api/wallets/balance?currency=IRT
 */
async function getBalance(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const currencyId = req.query.currency || 'IRT';

    const result = await walletService.getWalletBalance(userId, currencyId);

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * شارژ کیف پول (افزایش موجودی)
 * POST /api/wallets/deposit
 * Body: { amount, currency?, referenceId?, description? }
 */
async function deposit(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const { amount, currency, referenceId, description } = req.body;

    const result = await walletService.depositFunds(
      userId,
      amount,
      currency || 'IRT',
      referenceId || null,
      description || ''
    );

    return res.json({ success: true, message: 'Deposit successful', data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * برداشت از کیف پول (کاهش موجودی)
 * POST /api/wallets/withdraw
 * Body: { amount, currency?, referenceId?, description? }
 */
async function withdraw(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const { amount, currency, referenceId, description } = req.body;

    const result = await walletService.withdrawFunds(
      userId,
      amount,
      currency || 'IRT',
      referenceId || null,
      description || ''
    );

    return res.json({ success: true, message: 'Withdrawal successful', data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * انتقال وجه بین دو کاربر
 * POST /api/wallets/transfer
 * Body: { receiverId, amount, currency?, description? }
 */
async function transfer(req, res) {
  try {
    const senderId = req.user.userId || req.user.id;
    const { receiverId, amount, currency, description } = req.body;

    if (!receiverId) {
      return res.status(400).json({ success: false, error: 'Receiver ID is required' });
    }

    const result = await walletService.transferFunds(
      senderId,
      receiverId,
      amount,
      currency || 'IRT',
      description || ''
    );

    return res.json({ success: true, message: 'Transfer successful', data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * مسدودسازی وجه (Freeze)
 * POST /api/wallets/freeze
 * Body: { amount, currency?, description? }
 */
async function freeze(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const { amount, currency, description } = req.body;

    const result = await walletService.freezeFunds(
      userId,
      amount,
      currency || 'IRT',
      description || ''
    );

    return res.json({ success: true, message: 'Funds frozen successfully', data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * آزادسازی وجه مسدود (Release Hold)
 * POST /api/wallets/hold/release
 * Body: { amount, referenceType?, referenceId?, reason?, currency? }
 * SECURITY: userId منحصراً از req.user (توکن) استخراج می‌شود. برای کاربر غیر ادمین،
 * ارزش userId در بادی پذیرفته نمی‌شود و آزادسازی برای حساب دیگری مسدود است؛
 * ادمین می‌تواند (با مجوز admin/super_admin) userId متفاوت در بادی بفرستد.
 */
async function releaseHold(req, res) {
  try {
    const authUserId = req.user && (req.user.userId || req.user.id);
    if (!authUserId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    const role = String((req.user.role || '')).toLowerCase();
    const isAdmin = role === 'admin' || role === 'super_admin';

    let userId = authUserId;
    const bodyUserId = req.body && req.body.userId;
    if (bodyUserId && bodyUserId !== authUserId) {
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Cannot release hold for another user.' });
      }
      userId = bodyUserId;
    }

    const result = await walletService.releaseHold({
      userId,
      amount: req.body.amount,
      referenceType: (req.body && req.body.referenceType) || undefined,
      referenceId: (req.body && req.body.referenceId) || null,
      reason: (req.body && req.body.reason) || '',
      currencyId: (req.body && req.body.currency) || 'IRT',
    });

    return res.json({ success: true, message: 'Hold released successfully', data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * آزادسازی Escrow
 * POST /api/wallets/escrow/release
 * Body: { escrowWalletId, recipientId, currency?, description? }
 * SECURITY: کمیسیون پلتفرم از بدی پذیرفته نمی‌شود؛ سمت سرور (config.trip.commissionRates) محاسبه می‌شود.
 */
async function releaseEscrow(req, res) {
  try {
    const { escrowWalletId, recipientId, currency, description } = req.body;

    if (!escrowWalletId) {
      return res.status(400).json({ success: false, error: 'Escrow wallet ID is required' });
    }
    if (!recipientId) {
      return res.status(400).json({ success: false, error: 'Recipient ID is required' });
    }

    const result = await walletService.releaseEscrow(
      escrowWalletId,
      recipientId,
      currency || 'IRT',
      description || ''
    );

    return res.json({ success: true, message: 'Escrow released successfully', data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * بازگشت وجه (Refund)
 * POST /api/wallets/refund
 * Body: { transactionId, reason? }
 */
async function refund(req, res) {
  try {
    const { transactionId, reason } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'Transaction ID is required' });
    }

    const result = await walletService.refundFunds(
      transactionId,
      reason || ''
    );

    return res.json({ success: true, message: 'Refund processed successfully', data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * دریافت تاریخچه تراکنش‌ها
 * GET /api/wallets/transactions?currency=IRT&type=CREDIT&limit=20&offset=0
 */
async function getTransactions(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const currencyId = req.query.currency || null;
    const type = req.query.type || null;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await walletService.getTransactionHistory(userId, currencyId, {
      limit,
      offset,
      type
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

module.exports = {
  getBalance,
  deposit,
  withdraw,
  transfer,
  freeze,
  releaseHold,
  releaseEscrow,
  refund,
  getTransactions,
};
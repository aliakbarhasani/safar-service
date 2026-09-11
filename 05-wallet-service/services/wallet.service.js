/**
 * wallet.service.js - سرویس جامع کیف پول (PostgreSQL)
 * 
 * این سرویس مستقیماً روی PostgreSQL کار می‌کند و از Mongoose/MongoDB استفاده نمی‌کند.
 * 
 * معماری:
 *   - تراکنش‌های اتمیک PostgreSQL (BEGIN/COMMIT/ROLLBACK)
 *   - جداسازی موجودی: available_balance و frozen_balance
 *   - ثبت اجباری در wallet_ledger (دفتر کل فقط-افزودنی)
 *   - audit خودکار از طریق triggerهای دیتابیس
 *   - referenceId برای Idempotency و جلوگیری از Double Spending
 *   - انتشار رویداد WalletBalanceChanged از طریق EventBus
 * 
 * متدها:
 *   - getWalletBalance(userId, currencyId)
 *   - depositFunds(userId, amount, currencyId, referenceId, description)
 *   - withdrawFunds(userId, amount, currencyId, referenceId, description)
 *   - transferFunds(senderId, receiverId, amount, currencyId, description)
 *   - freezeFunds(userId, amount, currencyId, description) [جدید]
 *   - releaseEscrow(escrowWalletId, recipientId, currencyId, description, serviceType) [جدید - کمیسیون سمت سرور]
 *   - refundFunds(transactionId, reason) [جدید]
 */

const pg = require('../db/pg');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const Escrow = require('../models/escrow.model');
const config = require('../../14-config-system/server.config');
const eventBus = require('../../01-core-system/EventBus');

// ============================================================================
// توابع کمکی داخلی
// ============================================================================

/**
 * اعتبارسنجی مبلغ ورودی
 */
function validateAmount(amount) {
  if (amount == null || typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number greater than zero');
  }
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }
}

/**
 * اعتبارسنجی کد ارز
 */
function validateCurrency(currencyId) {
  if (!currencyId || typeof currencyId !== 'string') {
    throw new Error('Currency ID is required');
  }
}

/**
 * انتشار رویداد WalletBalanceChanged
 */
function publishBalanceChangedEvent(walletId, userId, amount, type, currencyId, availableBalance, frozenBalance, transactionId, description) {
  eventBus.publish('WalletBalanceChanged', {
    walletId: walletId.toString(),
    userId: userId.toString(),
    amount,
    type,
    currencyId,
    availableBalance,
    frozenBalance,
    totalBalance: availableBalance + frozenBalance,
    transactionId: transactionId.toString(),
    description: description || '',
    timestamp: new Date().toISOString()
  });
}

/**
 * دریافت یا ایجاد کیف پول کاربر برای ارز مشخص
 * این تابع تراکنش‌محور است (نیازمند client)
 */
async function getOrCreateWallet(client, userId, currencyId) {
  let wallet = await Wallet.findByUserAndCurrency(userId, currencyId);

  if (!wallet) {
    wallet = await Wallet.create({
      userId,
      currencyId,
      walletType: 'user',
      balance: 0,
      availableBalance: 0,
      frozenBalance: 0,
      status: 'active'
    });
  }

  if (wallet.status !== 'active') {
    throw new Error(`Wallet is ${wallet.status}. Cannot perform operations on a non-active wallet.`);
  }

  return wallet;
}

/**
 * اعتبارسنجی ورودی‌های متدهای اصلی
 */
function validateUserIds(senderId, receiverId) {
  if (!senderId || !receiverId) {
    throw new Error('Both sender ID and receiver ID are required');
  }
  if (senderId.toString() === receiverId.toString()) {
    throw new Error('Cannot transfer funds to yourself');
  }
}

// ============================================================================
// متدهای اصلی سرویس
// ============================================================================

/**
 * دریافت موجودی کیف پول کاربر بر اساس نوع ارز
 */
async function getWalletBalance(userId, currencyId = 'IRT') {
  validateCurrency(currencyId);

  if (!userId) {
    throw new Error('User ID is required');
  }

  const wallet = await Wallet.findByUserAndCurrency(userId, currencyId);

  if (!wallet) {
    return {
      balance: 0,
      availableBalance: 0,
      frozenBalance: 0,
      currencyId,
      status: 'no_wallet',
      message: 'No wallet found for this currency. Use deposit to create one.'
    };
  }

  return {
    walletId: wallet.id,
    userId: wallet.user_id,
    balance: parseFloat(wallet.balance),
    availableBalance: parseFloat(wallet.available_balance),
    frozenBalance: parseFloat(wallet.frozen_balance),
    walletType: wallet.wallet_type,
    currencyId: wallet.currency_id,
    status: wallet.status
  };
}

/**
 * افزایش موجودی (شارژ حساب)
 * 
 * نکات امنیتی:
 *   - کل عملیات در یک تراکنش PostgreSQL
 *   - بررسی referenceId برای جلوگیری از شارژ تکراری
 *   - ثبت همزمان در transactions و wallet_ledger
 */
async function depositFunds(userId, amount, currencyId = 'IRT', referenceId = null, description = '') {
  validateAmount(amount);
  validateCurrency(currencyId);

  if (!userId) {
    throw new Error('User ID is required');
  }

  return await pg.transaction(async (client) => {
    // 1. بررسی Idempotency
    if (referenceId) {
      const existingTx = await Transaction.findByReferenceId(referenceId);
      if (existingTx) {
        throw new Error(`Duplicate transaction: referenceId '${referenceId}' already exists`);
      }
    }

    // 2. دریافت یا ایجاد کیف پول
    const wallet = await getOrCreateWallet(client, userId, currencyId);

    // 3. ذخیره وضعیت قبل از تغییر برای ledger
    const balanceBefore = parseFloat(wallet.balance);
    const availableBefore = parseFloat(wallet.available_balance);
    const frozenBefore = parseFloat(wallet.frozen_balance);

    // 4. افزایش موجودی
    const updatedWallet = await Wallet.creditAvailableBalance(wallet.id, amount, client);
    if (!updatedWallet) {
      throw new Error('Failed to credit wallet balance');
    }

    const balanceAfter = parseFloat(updatedWallet.balance);
    const availableAfter = parseFloat(updatedWallet.available_balance);
    const frozenAfter = parseFloat(updatedWallet.frozen_balance);

    // 5. ثبت تراکنش
    const tx = await Transaction.create({
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      type: 'CREDIT',
      description: description || 'Wallet deposit',
      status: 'success',
      referenceId
    }, client);

    // 6. ثبت در دفتر کل (wallet_ledger)
    await Transaction.createLedgerEntry({
      walletId: wallet.id,
      transactionId: tx.id,
      creditAmount: amount,
      debitAmount: 0,
      currencyId,
      balanceBefore,
      balanceAfter,
      availableBefore,
      availableAfter,
      frozenBefore,
      frozenAfter,
      operationType: 'deposit',
      description: description || 'Wallet deposit',
      referenceId
    }, client);

    // انتشار رویداد (بعد از commit موفق)
    publishBalanceChangedEvent(
      wallet.id, userId, amount, 'CREDIT', currencyId,
      availableAfter, frozenAfter, tx.id, description
    );

    return {
      success: true,
      message: 'Deposit successful',
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      balance: balanceAfter,
      availableBalance: availableAfter,
      frozenBalance: frozenAfter,
      transactionId: tx.id,
      referenceId
    };
  });
}

/**
 * برداشت از حساب (کسر موجودی برای پرداخت سفر)
 * 
 * قانون تجاری: اگر موجودی کافی نبود، خطا پرتاب می‌کند.
 */
async function withdrawFunds(userId, amount, currencyId = 'IRT', referenceId = null, description = '') {
  validateAmount(amount);
  validateCurrency(currencyId);

  if (!userId) {
    throw new Error('User ID is required');
  }

  return await pg.transaction(async (client) => {
    // 1. بررسی Idempotency
    if (referenceId) {
      const existingTx = await Transaction.findByReferenceId(referenceId);
      if (existingTx) {
        throw new Error(`Duplicate transaction: referenceId '${referenceId}' already exists`);
      }
    }

    // 2. دریافت کیف پول
    const wallet = await Wallet.findByUserAndCurrency(userId, currencyId);
    if (!wallet) {
      throw new Error(`No wallet found for user ${userId} in currency ${currencyId}`);
    }
    if (wallet.status !== 'active') {
      throw new Error(`Wallet is ${wallet.status}. Cannot withdraw from a non-active wallet.`);
    }

    // 3. بررسی کافی بودن موجودی قابل استفاده
    const availableBalance = parseFloat(wallet.available_balance);
    if (availableBalance < amount) {
      throw new Error(
        `Insufficient available balance. Required: ${amount} ${currencyId}, Available: ${availableBalance} ${currencyId}`
      );
    }

    // 4. ذخیره وضعیت قبل
    const balanceBefore = parseFloat(wallet.balance);
    const availableBefore = availableBalance;
    const frozenBefore = parseFloat(wallet.frozen_balance);

    // 5. کاهش موجودی
    const updatedWallet = await Wallet.debitAvailableBalance(wallet.id, amount, client);
    if (!updatedWallet) {
      throw new Error('Failed to debit wallet balance. Possible race condition.');
    }

    const balanceAfter = parseFloat(updatedWallet.balance);
    const availableAfter = parseFloat(updatedWallet.available_balance);
    const frozenAfter = parseFloat(updatedWallet.frozen_balance);

    // 6. ثبت تراکنش DEBIT
    const tx = await Transaction.create({
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      type: 'DEBIT',
      description: description || 'Wallet withdrawal',
      status: 'success',
      referenceId
    }, client);

    // 7. ثبت در دفتر کل
    await Transaction.createLedgerEntry({
      walletId: wallet.id,
      transactionId: tx.id,
      creditAmount: 0,
      debitAmount: amount,
      currencyId,
      balanceBefore,
      balanceAfter,
      availableBefore,
      availableAfter,
      frozenBefore,
      frozenAfter,
      operationType: 'withdraw',
      description: description || 'Wallet withdrawal',
      referenceId
    }, client);

    // انتشار رویداد
    publishBalanceChangedEvent(
      wallet.id, userId, amount, 'DEBIT', currencyId,
      availableAfter, frozenAfter, tx.id, description
    );

    return {
      success: true,
      message: 'Withdrawal successful',
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      balance: balanceAfter,
      availableBalance: availableAfter,
      frozenBalance: frozenAfter,
      transactionId: tx.id,
      referenceId
    };
  });
}

/**
 * انتقال وجه بین دو کاربر (مثلاً مسافر به راننده)
 * 
 * در یک تراکنش واحد:
 *   1. از کیف پول فرستنده برداشت می‌کند
 *   2. به کیف پول گیرنده واریز می‌کند
 *   3. دو تراکنش (DEBIT و CREDIT) ثبت می‌کند
 *   4. دو ثبت در wallet_ledger (transfer_out, transfer_in)
 */
async function transferFunds(senderId, receiverId, amount, currencyId = 'IRT', description = '') {
  validateAmount(amount);
  validateCurrency(currencyId);
  validateUserIds(senderId, receiverId);

  return await pg.transaction(async (client) => {
    // 1. بازیابی کیف پول فرستنده (باید وجود داشته باشد)
    const senderWallet = await Wallet.findByUserAndCurrency(senderId, currencyId);
    if (!senderWallet) {
      throw new Error(`No wallet found for sender ${senderId} in currency ${currencyId}`);
    }
    if (senderWallet.status !== 'active') {
      throw new Error(`Sender wallet is ${senderWallet.status}. Cannot transfer from a non-active wallet.`);
    }

    // 2. بررسی موجودی
    const senderAvailable = parseFloat(senderWallet.available_balance);
    if (senderAvailable < amount) {
      throw new Error(
        `Insufficient balance. Required: ${amount} ${currencyId}, Available: ${senderAvailable} ${currencyId}`
      );
    }

    // 3. ذخیره وضعیت قبل
    const senderBalanceBefore = parseFloat(senderWallet.balance);
    const senderAvailableBefore = senderAvailable;
    const senderFrozenBefore = parseFloat(senderWallet.frozen_balance);

    // 4. کاهش از فرستنده
    const updatedSender = await Wallet.debitAvailableBalance(senderWallet.id, amount, client);
    if (!updatedSender) {
      throw new Error('Failed to debit sender wallet. Possible race condition.');
    }

    const senderBalanceAfter = parseFloat(updatedSender.balance);
    const senderAvailableAfter = parseFloat(updatedSender.available_balance);
    const senderFrozenAfter = parseFloat(updatedSender.frozen_balance);

    // 5. ایجاد یا دریافت کیف پول گیرنده
    let receiverWallet = await Wallet.findByUserAndCurrency(receiverId, currencyId);
    if (!receiverWallet) {
      receiverWallet = await Wallet.create({
        userId: receiverId,
        currencyId,
        walletType: 'user',
        balance: 0,
        availableBalance: 0,
        frozenBalance: 0,
        status: 'active'
      });
    }

    const receiverBalanceBefore = parseFloat(receiverWallet.balance);
    const receiverAvailableBefore = parseFloat(receiverWallet.available_balance);
    const receiverFrozenBefore = parseFloat(receiverWallet.frozen_balance);

    // 6. افزایش به گیرنده
    const updatedReceiver = await Wallet.creditAvailableBalance(receiverWallet.id, amount, client);
    if (!updatedReceiver) {
      // Rollback sender (atomic transaction handles this)
      throw new Error('Failed to credit receiver wallet');
    }

    const receiverBalanceAfter = parseFloat(updatedReceiver.balance);
    const receiverAvailableAfter = parseFloat(updatedReceiver.available_balance);
    const receiverFrozenAfter = parseFloat(updatedReceiver.frozen_balance);

    // 7. ثبت تراکنش DEBIT برای فرستنده
    const debitTx = await Transaction.create({
      walletId: senderWallet.id,
      userId: senderId,
      amount,
      currencyId,
      type: 'DEBIT',
      description: description || `Transfer to user ${receiverId}`,
      status: 'success'
    }, client);

    // 8. ثبت تراکنش CREDIT برای گیرنده
    const creditTx = await Transaction.create({
      walletId: receiverWallet.id,
      userId: receiverId,
      amount,
      currencyId,
      type: 'CREDIT',
      description: description || `Transfer from user ${senderId}`,
      status: 'success'
    }, client);

    // 9. ثبت در دفتر کل - فرستنده
    await Transaction.createLedgerEntry({
      walletId: senderWallet.id,
      transactionId: debitTx.id,
      creditAmount: 0,
      debitAmount: amount,
      currencyId,
      balanceBefore: senderBalanceBefore,
      balanceAfter: senderBalanceAfter,
      availableBefore: senderAvailableBefore,
      availableAfter: senderAvailableAfter,
      frozenBefore: senderFrozenBefore,
      frozenAfter: senderFrozenAfter,
      operationType: 'transfer_out',
      description: description || `Transfer to user ${receiverId}`
    }, client);

    // 10. ثبت در دفتر کل - گیرنده
    await Transaction.createLedgerEntry({
      walletId: receiverWallet.id,
      transactionId: creditTx.id,
      creditAmount: amount,
      debitAmount: 0,
      currencyId,
      balanceBefore: receiverBalanceBefore,
      balanceAfter: receiverBalanceAfter,
      availableBefore: receiverAvailableBefore,
      availableAfter: receiverAvailableAfter,
      frozenBefore: receiverFrozenBefore,
      frozenAfter: receiverFrozenAfter,
      operationType: 'transfer_in',
      description: description || `Transfer from user ${senderId}`
    }, client);

    // انتشار رویدادها
    publishBalanceChangedEvent(
      senderWallet.id, senderId, amount, 'DEBIT', currencyId,
      senderAvailableAfter, senderFrozenAfter, debitTx.id,
      description || `Transfer to user ${receiverId}`
    );
    publishBalanceChangedEvent(
      receiverWallet.id, receiverId, amount, 'CREDIT', currencyId,
      receiverAvailableAfter, receiverFrozenAfter, creditTx.id,
      description || `Transfer from user ${senderId}`
    );

    return {
      success: true,
      message: 'Transfer successful',
      sender: {
        walletId: senderWallet.id,
        userId: senderId,
        balance: senderBalanceAfter,
        availableBalance: senderAvailableAfter,
        frozenBalance: senderFrozenAfter,
        transactionId: debitTx.id
      },
      receiver: {
        walletId: receiverWallet.id,
        userId: receiverId,
        balance: receiverBalanceAfter,
        availableBalance: receiverAvailableAfter,
        frozenBalance: receiverFrozenAfter,
        transactionId: creditTx.id
      },
      amount,
      currencyId,
      description: description || 'Internal transfer'
    };
  });
}

/**
 * مسدودسازی وجه (Freeze) - انتقال از available به frozen
 * 
 * موارد استفاده: رزرو وجه برای سفر (Escrow)، وثیقه، بلوکه کردن
 */
async function freezeFunds(userId, amount, currencyId = 'IRT', description = '') {
  validateAmount(amount);
  validateCurrency(currencyId);

  if (!userId) {
    throw new Error('User ID is required');
  }

  return await pg.transaction(async (client) => {
    // 1. دریافت کیف پول
    const wallet = await Wallet.findByUserAndCurrency(userId, currencyId);
    if (!wallet) {
      throw new Error(`No wallet found for user ${userId} in currency ${currencyId}`);
    }
    if (wallet.status !== 'active') {
      throw new Error(`Wallet is ${wallet.status}. Cannot freeze funds.`);
    }

    // 2. بررسی موجودی قابل استفاده
    const availableBalance = parseFloat(wallet.available_balance);
    if (availableBalance < amount) {
      throw new Error(
        `Insufficient available balance to freeze. Required: ${amount} ${currencyId}, Available: ${availableBalance} ${currencyId}`
      );
    }

    // 3. ذخیره وضعیت قبل
    const balanceBefore = parseFloat(wallet.balance);
    const availableBefore = availableBalance;
    const frozenBefore = parseFloat(wallet.frozen_balance);

    // 4. انتقال از available به frozen
    const updatedWallet = await Wallet.freezeAvailable(wallet.id, amount, client);
    if (!updatedWallet) {
      throw new Error('Failed to freeze funds. Possible race condition.');
    }

    const balanceAfter = parseFloat(updatedWallet.balance);
    const availableAfter = parseFloat(updatedWallet.available_balance);
    const frozenAfter = parseFloat(updatedWallet.frozen_balance);

    // 5. ثبت تراکنش (DEBIT symbolic با status 'pending')
    const tx = await Transaction.create({
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      type: 'DEBIT',
      description: description || `Funds frozen: ${description}`,
      status: 'pending'
    }, client);

    // 6. ثبت در دفتر کل
    await Transaction.createLedgerEntry({
      walletId: wallet.id,
      transactionId: tx.id,
      creditAmount: 0,
      debitAmount: 0, // Zero because total balance doesn't change
      currencyId,
      balanceBefore,
      balanceAfter,
      availableBefore,
      availableAfter,
      frozenBefore,
      frozenAfter,
      operationType: 'freeze',
      description: description || 'Funds frozen'
    }, client);

    publishBalanceChangedEvent(
      wallet.id, userId, amount, 'DEBIT', currencyId,
      availableAfter, frozenAfter, tx.id, description || 'Funds frozen'
    );

    return {
      success: true,
      message: 'Funds frozen successfully',
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      balance: balanceAfter,
      availableBalance: availableAfter,
      frozenBalance: frozenAfter,
      transactionId: tx.id,
      description: description || 'Funds frozen'
    };
  });
}

/**
 * آزادسازی وجه مسدود (Release Hold)
 * 
 * سناریو: لغو سفر توسط مسافر یا راننده
 * مبلغ از frozen_balance کسر و به available_balance بازگردانده می‌شود.
 * 
 * نکات امنیتی:
 *   - کل عملیات در یک تراکنش PostgreSQL
 *   - بررسی referenceId برای Idempotency
 *   - قفل ردیفی با SELECT ... FOR UPDATE
 *   - بررسی کافی بودن frozen_balance
 */
async function releaseHold({ userId, amount, referenceType = 'hold', referenceId = null, reason = '', currencyId = 'IRT' } = {}) {
  validateAmount(amount);
  validateCurrency(currencyId);

  if (!userId) {
    throw new Error('User ID is required');
  }

  return await pg.transaction(async (client) => {
    // 1. بررسی Idempotency
    if (referenceId) {
      const existingTx = await Transaction.findByReferenceId(referenceId);
      if (existingTx) {
        throw new Error(`Duplicate transaction: referenceId '${referenceId}' already exists`);
      }
    }

    // 2. دریافت کیف پول با قفل ردیفی
    const walletResult = await client.query(
      `SELECT * FROM wallets WHERE user_id = $1 AND currency_id = $2 AND deleted_at IS NULL AND status = 'active' FOR UPDATE`,
      [userId, currencyId]
    );
    const wallet = walletResult.rows[0];
    
    if (!wallet) {
      throw new Error(`No active wallet found for user ${userId} in currency ${currencyId}`);
    }

    // 3. بررسی کافی بودن موجودی مسدود
    const availableBefore = parseFloat(wallet.available_balance);
    const frozenBefore = parseFloat(wallet.frozen_balance);
    
    if (frozenBefore < amount) {
      throw new Error(
        `Insufficient frozen balance to release. Requested: ${amount} ${currencyId}, Frozen: ${frozenBefore} ${currencyId}`
      );
    }

    const balanceBefore = parseFloat(wallet.balance);

    // 4. آزادسازی وجه (frozen → available)
    const updatedWallet = await Wallet.unfreezeFrozen(wallet.id, amount, client);
    if (!updatedWallet) {
      throw new Error('Failed to release frozen funds. Possible race condition.');
    }

    const balanceAfter = parseFloat(updatedWallet.balance);
    const availableAfter = parseFloat(updatedWallet.available_balance);
    const frozenAfter = parseFloat(updatedWallet.frozen_balance);

    // 5. ثبت تراکنش
    const tx = await Transaction.create({
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      type: 'CREDIT',
      description: reason || `Hold released (${referenceType})`,
      status: 'success',
      referenceId
    }, client);

    // 6. ثبت در دفتر کل
    await Transaction.createLedgerEntry({
      walletId: wallet.id,
      transactionId: tx.id,
      creditAmount: 0,
      debitAmount: 0,
      currencyId,
      balanceBefore,
      balanceAfter,
      availableBefore,
      availableAfter,
      frozenBefore,
      frozenAfter,
      operationType: 'UNHOLD', // UNHOLD/RELEASE: آزادسازی وجه مسدود
      description: reason || `Hold released (${referenceType})`,
      referenceId
    }, client);

    // انتشار رویداد
    publishBalanceChangedEvent(
      wallet.id, userId, amount, 'CREDIT', currencyId,
      availableAfter, frozenAfter, tx.id, reason || 'Hold released'
    );

    return {
      success: true,
      message: 'Hold released successfully',
      walletId: wallet.id,
      userId,
      amount,
      currencyId,
      referenceType,
      balance: balanceAfter,
      availableBalance: availableAfter,
      frozenBalance: frozenAfter,
      transactionId: tx.id,
      referenceId
    };
  });
}
/**
 * آزادسازی Escrow (legacy, مبتنی بر کیف پول)
 *
 * SECURITY (کمیسیون سمت سرور): کمیسیون پلتفرم هرگز از فراخوان/بادی گرفته نمی‌شود؛
 * به‌صورت سمت سرور و بر اساس نرخ‌های تاییدشده `config.trip.commissionRates`
 * (14-config-system) روی مبلغ Escrow محاسبه می‌شود. پارامتر `serviceType` فقط
 * توسط فراخوان‌کننده معتبر (مثلاً Mobility پشت RBAC) برای اعمال نرخ سرویس‌خاص
 * داده می‌شود؛ در غیر این‌صورت نرخ پیش‌فرض شهری مورد استفاده قرار می‌گیرد.
 */
async function releaseEscrow(escrowWalletId, recipientId, currencyId = 'IRT', description = '', serviceType = null) {
  if (!recipientId) {
    throw new Error('Recipient ID is required');
  }

  return await pg.transaction(async (client) => {
    // 1. دریافت کیف پول Escrow
    const escrowWallet = await Wallet.findById(escrowWalletId);
    if (!escrowWallet) {
      throw new Error(`Escrow wallet not found: ${escrowWalletId}`);
    }

    const escrowFrozen = parseFloat(escrowWallet.frozen_balance);

    // 2. محاسبه کمیسیون سمت سرور (هرگز از بدی درخواست)
    const commissionRates = (config.trip && config.trip.commissionRates) || {};
    const rate = commissionRates[serviceType] || commissionRates.urban_taxi || 10;
    const platformCommission = (escrowFrozen * rate) / 100;
    const netAmount = escrowFrozen - platformCommission;

    // 3. دریافت یا ایجاد کیف پول گیرنده
    const recipientWallet = await getOrCreateWallet(client, recipientId, currencyId);

    // 4. دریافت کیف پول پلتفرم
    const platformWallet = await Wallet.findByUserAndCurrency(
      (await client.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1")).rows[0]?.id,
      currencyId
    );

    // 5. ذخیره وضعیت قبل برای ledger
    const escrowBalanceBefore = parseFloat(escrowWallet.balance);
    const escrowAvailableBefore = parseFloat(escrowWallet.available_balance);
    const escrowFrozenBefore = parseFloat(escrowWallet.frozen_balance);

    // 6. کسر از frozen escrow
    const updatedEscrow = await Wallet.deductFrozen(escrowWallet.id, escrowFrozen, client);
    if (!updatedEscrow) {
      throw new Error('Failed to deduct escrow frozen balance');
    }

    const escrowBalanceAfter = parseFloat(updatedEscrow.balance);
    const escrowFrozenAfter = parseFloat(updatedEscrow.frozen_balance);

    // 7. واریز خالص به گیرنده
    const recipientAvailableBefore = parseFloat(recipientWallet.available_balance);
    const updatedRecipient = await Wallet.creditAvailableBalance(recipientWallet.id, netAmount, client);
    if (!updatedRecipient) {
      throw new Error('Failed to credit recipient');
    }

    const recipientBalanceAfter = parseFloat(updatedRecipient.balance);
    const recipientAvailableAfter = parseFloat(updatedRecipient.available_balance);

    // 8. واریز کارمزد به پلتفرم
    if (platformWallet && platformCommission > 0) {
      await Wallet.creditAvailableBalance(platformWallet.id, platformCommission, client);
    }

    // 9. ثبت تراکنش‌ها
    const escrowTx = await Transaction.create({
      walletId: escrowWallet.id,
      userId: escrowWallet.user_id,
      amount: escrowFrozen,
      currencyId,
      type: 'DEBIT',
      description: description || 'Escrow release - deduction',
      status: 'success'
    }, client);

    const recipientTx = await Transaction.create({
      walletId: recipientWallet.id,
      userId: recipientId,
      amount: netAmount,
      currencyId,
      type: 'CREDIT',
      description: description || 'Escrow release - payment',
      status: 'success'
    }, client);

    // 10. ثبت در دفتر کل
    await Transaction.createLedgerEntry({
      walletId: escrowWallet.id,
      transactionId: escrowTx.id,
      creditAmount: 0,
      debitAmount: escrowFrozen,
      currencyId,
      balanceBefore: escrowBalanceBefore,
      balanceAfter: escrowBalanceAfter,
      availableBefore: escrowAvailableBefore,
      availableAfter: escrowAvailableBefore, // unchanged
      frozenBefore: escrowFrozenBefore,
      frozenAfter: escrowFrozenAfter,
      operationType: 'escrow_release',
      description: description || 'Escrow released'
    }, client);

    await Transaction.createLedgerEntry({
      walletId: recipientWallet.id,
      transactionId: recipientTx.id,
      creditAmount: netAmount,
      debitAmount: 0,
      currencyId,
      balanceBefore: recipientAvailableBefore,
      balanceAfter: recipientBalanceAfter,
      availableBefore: recipientAvailableBefore,
      availableAfter: recipientAvailableAfter,
      frozenBefore: 0,
      frozenAfter: 0,
      operationType: 'escrow_release',
      description: description || 'Escrow payment received'
    }, client);

    return {
      success: true,
      message: 'Escrow released successfully',
      recipient: {
        walletId: recipientWallet.id,
        amount: netAmount,
        availableBalance: recipientAvailableAfter
      },
      platformCommission: {
        amount: platformCommission
      },
      transactionIds: {
        escrow: escrowTx.id,
        recipient: recipientTx.id
      }
    };
  });
}

/**
 * بازگشت وجه (Refund)
 * 
 * تراکنش اصلی را معکوس می‌کند:
 *   1. مبلغ را به کیف پول کاربر برمی‌گرداند
 *   2. تراکنش refund ثبت می‌کند
 *   3. در دفتر کل ثبت می‌کند
 */
async function refundFunds(originalTransactionId, reason = '') {
  if (!originalTransactionId) {
    throw new Error('Original transaction ID is required');
  }

  return await pg.transaction(async (client) => {
    const originalTx = await Transaction.findById(originalTransactionId);
    if (!originalTx) throw new Error(`Original transaction not found: ${originalTransactionId}`);
    if (originalTx.status === 'failed') throw new Error('Cannot refund a failed transaction');

    const wallet = await Wallet.findById(originalTx.wallet_id);
    if (!wallet) throw new Error(`Wallet not found for transaction: ${originalTransactionId}`);

    const amount = parseFloat(originalTx.amount);
    const currencyId = originalTx.currency_id;

    const balanceBefore = parseFloat(wallet.balance);
    const availableBefore = parseFloat(wallet.available_balance);
    const frozenBefore = parseFloat(wallet.frozen_balance);

    const updatedWallet = await Wallet.creditAvailableBalance(wallet.id, amount, client);
    if (!updatedWallet) throw new Error('Failed to process refund');

    const balanceAfter = parseFloat(updatedWallet.balance);
    const availableAfter = parseFloat(updatedWallet.available_balance);
    const frozenAfter = parseFloat(updatedWallet.frozen_balance);

    const refundTx = await Transaction.create({
      walletId: wallet.id, userId: originalTx.user_id, tripId: originalTx.trip_id,
      amount, currencyId, type: 'CREDIT',
      description: `Refund: ${reason || 'Customer refund'}`,
      status: 'success', referenceId: `REFUND-${originalTransactionId}`
    }, client);

    await Transaction.createLedgerEntry({
      walletId: wallet.id, transactionId: refundTx.id, creditAmount: amount, debitAmount: 0,
      currencyId, balanceBefore, balanceAfter, availableBefore, availableAfter, frozenBefore, frozenAfter,
      operationType: 'refund', description: reason || 'Customer refund',
      referenceId: `REFUND-${originalTransactionId}`
    }, client);

    publishBalanceChangedEvent(wallet.id, originalTx.user_id, amount, 'CREDIT', currencyId,
      availableAfter, frozenAfter, refundTx.id, reason || 'Refund');

    return { success: true, message: 'Refund processed successfully',
      walletId: wallet.id, userId: originalTx.user_id, amount, currencyId,
      availableBalance: availableAfter, originalTransactionId, refundTransactionId: refundTx.id,
      reason: reason || 'Customer refund' };
  });
}

// ============================================================================
// چرخه کامل ۷ مرحله‌ای Escrow
// ============================================================================

/**
 * [مرحله ۱] ایجاد Escrow - مسدودسازی وجه سفر برای پرداخت امن
 * 
 * این متد:
 *   1. وجه را از available به frozen در کیف پول payer منتقل می‌کند
 *   2. رکورد escrow_transactions با status='active' ایجاد می‌کند
 *   3. در wallet_ledger ثبت می‌کند
 * 
 * @param {Object} params
 * @param {string} params.payerId - شناسه پرداخت‌کننده
 * @param {string} params.payeeId - شناسه دریافت‌کننده
 * @param {number} params.amount - مبلغ
 * @param {string} params.currencyId - کد ارز
 * @param {number} params.platformCommission - کارمزد پلتفرم
 * @param {string} params.tripId - شناسه سفر (اختیاری)
 * @param {string} params.description - توضیحات
 * @returns {Object} escrow created
 */
async function createEscrow({ payerId, payeeId, amount, currencyId = 'IRT', platformCommission = 0, tripId = null, description = '' }) {
  validateAmount(amount);
  validateCurrency(currencyId);
  if (!payerId) throw new Error('Payer ID is required');

  return await pg.transaction(async (client) => {
    const netAmount = amount - platformCommission;
    if (netAmount <= 0) throw new Error('Net amount after commission must be positive');

    // 1. Freeze payer funds
    const freezeResult = await freezeFunds(payerId, amount, currencyId, `Escrow: ${description || 'Trip payment'}`);

    // 2. پیدا کردن کیف پول payer
    const payerWallet = await Wallet.findByUserAndCurrency(payerId, currencyId);
    if (!payerWallet) throw new Error(`Payer wallet not found: ${payerId}`);

    // 3. پیدا کردن کیف پول پلتفرم (برای commission)
    let platformWallet = null;
    try {
      const adminResult = await client.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
      if (adminResult.rows[0]) {
        platformWallet = await Wallet.findByUserAndCurrency(adminResult.rows[0].id, currencyId);
      }
    } catch (e) { /* silent, platform wallet is optional */ }

    // 4. ایجاد رکورد Escrow
    const escrow = await Escrow.create({
      tripId, payerId, payeeId: payeeId || null,
      amount, currencyId, platformCommission, netAmount,
      sourceWalletId: payerWallet.id,
      destinationWalletId: null,
      platformWalletId: platformWallet?.id || null,
      description: description || 'Escrow for trip payment'
    }, client);

    return {
      success: true,
      message: 'Escrow created successfully',
      escrowId: escrow.id,
      status: escrow.status,
      amount,
      currencyId,
      platformCommission,
      netAmount,
      transactionId: freezeResult.transactionId
    };
  });
}

/**
 * [مرحله ۲] آزادسازی Escrow (زمانی که سفر با موفقیت انجام شود)
 * 
 * از frozen کیف پول فرستنده کم می‌کند:
 *   1. مبلغ خالص به گیرنده واریز می‌شود
 *   2. کارمزد به پلتفرم واریز می‌شود
 *   3. status escrow به 'released' تغییر می‌کند
 */
async function releaseEscrowFull(escrowId) {
  if (!escrowId) throw new Error('Escrow ID is required');

  return await pg.transaction(async (client) => {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
    if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);
    if (!escrow.payee_id) throw new Error('Escrow has no payee assigned. Use assignPayee first.');

    const amount = parseFloat(escrow.amount);
    const platformCommission = parseFloat(escrow.platform_commission);
    const netAmount = parseFloat(escrow.net_amount);
    const currencyId = escrow.currency_id;

    // 1. ذخیره وضعیت قبل escrow wallet
    const sourceWallet = await Wallet.findById(escrow.source_wallet_id);
    if (!sourceWallet) throw new Error('Source wallet not found');

    const srcBalanceBefore = parseFloat(sourceWallet.balance);
    const srcAvailableBefore = parseFloat(sourceWallet.available_balance);
    const srcFrozenBefore = parseFloat(sourceWallet.frozen_balance);

    // 2. کسر از frozen فرستنده
    const updatedSrc = await Wallet.deductFrozen(sourceWallet.id, amount, client);
    if (!updatedSrc) throw new Error('Failed to deduct frozen amount from payer wallet');

    const srcBalanceAfter = parseFloat(updatedSrc.balance);
    const srcFrozenAfter = parseFloat(updatedSrc.frozen_balance);

    // 3. واریز خالص به گیرنده
    const payeeWallet = await getOrCreateWallet(client, escrow.payee_id, currencyId);
    const payeeAvailableBefore = parseFloat(payeeWallet.available_balance);
    const updatedPayee = await Wallet.creditAvailableBalance(payeeWallet.id, netAmount, client);
    if (!updatedPayee) throw new Error('Failed to credit payee wallet');
    const payeeAvailableAfter = parseFloat(updatedPayee.available_balance);

    // 4. واریز کارمزد به پلتفرم
    if (escrow.platform_wallet_id && platformCommission > 0) {
      await Wallet.creditAvailableBalance(escrow.platform_wallet_id, platformCommission, client);
    }

    // 5. ثبت تراکنش‌ها
    const debitTx = await Transaction.create({
      walletId: sourceWallet.id, userId: escrow.payer_id,
      amount, currencyId, type: 'DEBIT',
      description: `Escrow release to user ${escrow.payee_id}`, status: 'success'
    }, client);

    const creditTx = await Transaction.create({
      walletId: payeeWallet.id, userId: escrow.payee_id,
      amount: netAmount, currencyId, type: 'CREDIT',
      description: `Escrow payment from user ${escrow.payer_id}`, status: 'success'
    }, client);

    // 6. ثبت در دفتر کل
    await Transaction.createLedgerEntry({
      walletId: sourceWallet.id, transactionId: debitTx.id,
      creditAmount: 0, debitAmount: amount, currencyId,
      balanceBefore: srcBalanceBefore, balanceAfter: srcBalanceAfter,
      availableBefore: srcAvailableBefore, availableAfter: srcAvailableBefore,
      frozenBefore: srcFrozenBefore, frozenAfter: srcFrozenAfter,
      operationType: 'escrow_release',
      description: `Escrow released - debited from payer ${escrow.payer_id}`
    }, client);

    await Transaction.createLedgerEntry({
      walletId: payeeWallet.id, transactionId: creditTx.id,
      creditAmount: netAmount, debitAmount: 0, currencyId,
      balanceBefore: payeeAvailableBefore, balanceAfter: payeeAvailableAfter,
      availableBefore: payeeAvailableBefore, availableAfter: payeeAvailableAfter,
      frozenBefore: 0, frozenAfter: 0,
      operationType: 'escrow_release',
      description: `Escrow released - credited to payee ${escrow.payee_id}`
    }, client);

    // 7. بروزرسانی Escrow
    const updatedEscrow = await Escrow.updateStatus(escrow.id, 'released', {
      destination_wallet_id: payeeWallet.id
    }, client);

    // 8. انتشار رویداد
    eventBus.publish('EscrowReleased', {
      escrowId: escrow.id, payerId: escrow.payer_id, payeeId: escrow.payee_id,
      amount, netAmount, platformCommission, currencyId,
      timestamp: new Date().toISOString()
    });

    return { success: true, message: 'Escrow released successfully',
      escrowId: escrow.id, status: 'released',
      payee: { walletId: payeeWallet.id, amount: netAmount, balance: payeeAvailableAfter },
      platformCommission };
  });
}

/**
 * [مرحله ۳] بازگشت Escrow (زمانی که سفر لغو شود)
 * 
 * وجه frozen را به available برمی‌گرداند
 */
async function refundEscrow(escrowId, reason = '') {
  if (!escrowId) throw new Error('Escrow ID is required');

  return await pg.transaction(async (client) => {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
    if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);

    const amount = parseFloat(escrow.amount);
    const currencyId = escrow.currency_id;

    // Unfreeze: frozen -> available
    const updatedWallet = await Wallet.unfreezeFrozen(escrow.source_wallet_id, amount, client);
    if (!updatedWallet) throw new Error('Failed to unfreeze escrow funds');

    // ثبت دفتر کل
    const tx = await Transaction.create({
      walletId: escrow.source_wallet_id, userId: escrow.payer_id,
      amount, currencyId, type: 'CREDIT',
      description: `Escrow refund: ${reason || 'Trip cancelled'}`, status: 'success'
    }, client);

    await Transaction.createLedgerEntry({
      walletId: escrow.source_wallet_id, transactionId: tx.id,
      creditAmount: amount, debitAmount: 0, currencyId,
      balanceBefore: parseFloat(escrow.amount), balanceAfter: parseFloat(escrow.amount),
      availableBefore: parseFloat(escrow.amount) - amount, availableAfter: parseFloat(escrow.amount),
      frozenBefore: amount, frozenAfter: 0,
      operationType: 'refund',
      description: reason || 'Escrow refunded'
    }, client);

    const updatedEscrow = await Escrow.updateStatus(escrow.id, 'refunded', {}, client);

    eventBus.publish('EscrowRefunded', {
      escrowId: escrow.id, payerId: escrow.payer_id, amount, currencyId, reason,
      timestamp: new Date().toISOString()
    });

    return { success: true, message: 'Escrow refunded successfully',
      escrowId: escrow.id, status: 'refunded', amount };
  });
}

/**
 * [مرحله ۴] انقضای Escrow (زمانبندی خودکار)
 * 
 * اگر Escrow بعد از مدت مشخصی آزاد نشود، وجه به payer برمی‌گردد
 */
async function expireEscrow(escrowId) {
  if (!escrowId) throw new Error('Escrow ID is required');

  return await pg.transaction(async (client) => {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
    if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);

    const amount = parseFloat(escrow.amount);
    const currencyId = escrow.currency_id;

    const updatedWallet = await Wallet.unfreezeFrozen(escrow.source_wallet_id, amount, client);
    if (!updatedWallet) throw new Error('Failed to unfreeze expired escrow');

    const tx = await Transaction.create({
      walletId: escrow.source_wallet_id, userId: escrow.payer_id,
      amount, currencyId, type: 'CREDIT',
      description: 'Escrow expired - funds returned', status: 'success'
    }, client);

    await Transaction.createLedgerEntry({
      walletId: escrow.source_wallet_id, transactionId: tx.id,
      creditAmount: amount, debitAmount: 0, currencyId,
      balanceBefore: parseFloat(escrow.amount), balanceAfter: parseFloat(escrow.amount),
      availableBefore: 0, availableAfter: amount,
      frozenBefore: amount, frozenAfter: 0,
      operationType: 'expire',
      description: 'Escrow expired'
    }, client);

    const updatedEscrow = await Escrow.updateStatus(escrow.id, 'expired', {}, client);

    eventBus.publish('EscrowExpired', {
      escrowId: escrow.id, payerId: escrow.payer_id, amount, currencyId,
      timestamp: new Date().toISOString()
    });

    return { success: true, message: 'Escrow expired, funds returned to payer',
      escrowId: escrow.id, status: 'expired', amount };
  });
}

/**
 * [مرحله ۵] ثبت اختلاف (Dispute) در Escrow
 * 
 * وجه در حالت frozen باقی می‌ماند تا اختلاف حل شود
 */
async function disputeEscrow(escrowId, reason = '') {
  if (!escrowId) throw new Error('Escrow ID is required');

  const escrow = await Escrow.findById(escrowId);
  if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
  if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);

  const updatedEscrow = await Escrow.updateStatus(escrow.id, 'disputed', {
    dispute_reason: reason || 'Customer dispute'
  });

  eventBus.publish('EscrowDisputed', {
    escrowId: escrow.id, payerId: escrow.payer_id, payeeId: escrow.payee_id,
    amount: parseFloat(escrow.amount), reason: reason || 'Customer dispute',
    timestamp: new Date().toISOString()
  });

  return { success: true, message: 'Escrow disputed, funds remain frozen',
    escrowId: escrow.id, status: 'disputed' };
}

/**
 * [مرحله ۶] حل اختلاف (Resolve Dispute)
 * 
 * ادمین می‌تواند Escrow را به یکی از حالت‌های زیر هدایت کند:
 *   - release: آزادسازی به نفع گیرنده
 *   - refund: بازگشت به نفع پرداخت‌کننده
 * 
 * @param {string} escrowId - شناسه Escrow
 * @param {'release'|'refund'} resolution - نوع راه‌حل
 * @param {string} notes - توضیحات
 */
async function resolveDispute(escrowId, resolution = 'release', notes = '', resolvedBy = null) {
  if (!escrowId) throw new Error('Escrow ID is required');
  if (!['release', 'refund'].includes(resolution)) throw new Error('Resolution must be "release" or "refund"');

  const escrow = await Escrow.findById(escrowId);
  if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
  if (escrow.status !== 'disputed') throw new Error(`Escrow is ${escrow.status}, not 'disputed'`);

  let result;
  if (resolution === 'release') {
    result = await releaseEscrowFull(escrowId);
  } else {
    result = await refundEscrow(escrowId, `Dispute resolved: ${notes || 'Admin decision'}`);
  }

  // بروزرسانی escrow با resolved
  await Escrow.updateStatus(escrow.id, 'resolved', {
    dispute_reason: escrow.dispute_reason,
    resolution_notes: notes || 'Dispute resolved',
    resolved_by: resolvedBy || null
  });

  eventBus.publish('EscrowDisputeResolved', {
    escrowId, resolution, notes: notes || 'Admin decision',
    timestamp: new Date().toISOString()
  });

  return { success: true, message: `Dispute resolved: ${resolution}`,
    escrowId, resolution, details: result };
}

/**
 * تعیین گیرنده Escrow (اختیاری - برای زمانی که هنوز مشخص نیست)
 */
async function assignPayeeToEscrow(escrowId, payeeId) {
  if (!escrowId || !payeeId) throw new Error('Escrow ID and Payee ID are required');

  const escrow = await Escrow.findById(escrowId);
  if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
  if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);

  const updatedEscrow = await Escrow.updateStatus(escrow.id, 'active', { payee_id: payeeId });
  return { success: true, message: 'Payee assigned to escrow',
    escrowId: escrow.id, payeeId };
}

/**
 * دریافت تاریخچه تراکنش‌های کاربر
 */
async function getTransactionHistory(userId, currencyId = null, options = {}) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const { limit = 20, offset = 0, type = null } = options;

  const transactions = await Transaction.findByUserId(userId, { limit, offset, type });
  const total = await Transaction.countByUserId(userId, type);

  return {
    transactions,
    pagination: {
      total,
      limit,
      offset,
      hasMore: (offset + limit) < total
    }
  };
}

module.exports = {
  getWalletBalance,
  depositFunds,
  withdrawFunds,
  transferFunds,
  freezeFunds,
  releaseHold,
  releaseEscrow,
  refundFunds,
  getTransactionHistory,
  // چرخه ۷ مرحله‌ای Escrow
  createEscrow,
  releaseEscrowFull,
  refundEscrow,
  expireEscrow,
  disputeEscrow,
  resolveDispute,
  assignPayeeToEscrow,
};

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
    userId: userId == null ? null : userId.toString(),
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
  // Serialize wallet creation for this user/currency pair so concurrent
  // settlements cannot both observe "missing" and race into the UNIQUE index.
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [String(userId), String(currencyId)]
  );

  let wallet = await Wallet.findByUserAndCurrency(userId, currencyId, client);

  if (!wallet) {
    wallet = await Wallet.create({
      userId,
      currencyId,
      walletType: 'user',
      balance: 0,
      availableBalance: 0,
      frozenBalance: 0,
      status: 'active'
    }, client);
  }

  if (wallet.status !== 'active') {
    throw new Error(`Wallet is ${wallet.status}. Cannot perform operations on a non-active wallet.`);
  }

  return wallet;
}


async function getPlatformWallet(client, currencyId) {
  // Platform wallets are system-owned rows with wallet_type='platform' and
  // user_id=NULL. Never create a human wallet for a synthetic system user ID.
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    ['wallet-type:platform', String(currencyId)]
  );
  const wallet = await Wallet.findByTypeAndCurrency('platform', currencyId, client);
  if (!wallet) {
    throw new Error(`Platform wallet is not configured for currency ${currencyId}; run database migrations/seeds first`);
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

  const result = await pg.transaction(async (client) => {
    // 1. بررسی Idempotency
    if (referenceId) {
      const existingTx = await Transaction.findByReferenceId(referenceId, client);
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
      referenceId,
      event: {
        walletId: wallet.id, userId, amount, currencyId,
        availableBalance: availableAfter, frozenBalance: frozenAfter,
        transactionId: tx.id, description: description || 'Wallet deposit',
      }
    };
  });

  try {
    const event = result.event;
    publishBalanceChangedEvent(
      event.walletId, event.userId, event.amount, 'CREDIT', event.currencyId,
      event.availableBalance, event.frozenBalance, event.transactionId, event.description
    );
  } catch (error) {
    console.error('[WalletService] Failed to publish WalletBalanceChanged after deposit commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
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

  const result = await pg.transaction(async (client) => {
    // 1. بررسی Idempotency
    if (referenceId) {
      const existingTx = await Transaction.findByReferenceId(referenceId, client);
      if (existingTx) {
        throw new Error(`Duplicate transaction: referenceId '${referenceId}' already exists`);
      }
    }

    // 2. دریافت کیف پول
    const wallet = await Wallet.findByUserAndCurrency(userId, currencyId, client);
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
      referenceId,
      event: {
        walletId: wallet.id, userId, amount, type: 'DEBIT', currencyId,
        availableBalance: availableAfter, frozenBalance: frozenAfter,
        transactionId: tx.id, description
      }
    };
  });

  try {
    const event = result.event;
    publishBalanceChangedEvent(
      event.walletId, event.userId, event.amount, event.type, event.currencyId,
      event.availableBalance, event.frozenBalance, event.transactionId, event.description
    );
  } catch (error) {
    console.error('[WalletService] Failed to publish WalletBalanceChanged after withdrawal commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
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
async function transferFunds(senderId, receiverId, amount, currencyId = 'IRT', description = '', referenceId = null) {
  validateAmount(amount);
  validateCurrency(currencyId);
  validateUserIds(senderId, receiverId);

  const senderReferenceId = referenceId ? `${referenceId}:sender` : null;
  const receiverReferenceId = referenceId ? `${referenceId}:receiver` : null;

  const result = await pg.transaction(async (client) => {
    if (referenceId) {
      // Serialize requests sharing a transfer reference. This closes the race
      // between "check existing" and the first ledger write.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`wallet-transfer:${String(referenceId)}`]
      );

      const existingResult = await client.query(
        `SELECT
           t.id, t.wallet_id, t.user_id, t.amount, t.currency_id, t.type,
           t.description, t.status, t.reference_id, c.code AS currency_code,
           wl.id AS ledger_id, wl.balance_after, wl.available_after, wl.frozen_after
         FROM transactions t
         JOIN currencies c ON c.id = t.currency_id
         LEFT JOIN wallet_ledger wl
           ON wl.transaction_id = t.id AND wl.reference_id = t.reference_id
         WHERE t.reference_id = $1 OR t.reference_id = $2
         ORDER BY t.reference_id
         FOR UPDATE OF t`,
        [senderReferenceId, receiverReferenceId]
      );
      const existingRows = existingResult.rows || [];
      if (existingRows.length > 0) {
        const senderTx = existingRows.find((row) => row.reference_id === senderReferenceId);
        const receiverTx = existingRows.find((row) => row.reference_id === receiverReferenceId);

        if (!senderTx || !receiverTx) {
          throw new Error('IDEMPOTENCY_STATE_INCOMPLETE: transfer records are incomplete; manual reconciliation is required');
        }

        const expectedSenderDescription = description || `Transfer to user ${receiverId}`;
        const expectedReceiverDescription = description || `Transfer from user ${senderId}`;
        const amountMatches = Number(senderTx.amount) === amount && Number(receiverTx.amount) === amount;
        const currencyMatches = [senderTx, receiverTx].every((row) =>
          row.currency_code === currencyId || String(row.currency_id) === String(currencyId)
        );
        const samePayload =
          String(senderTx.user_id) === String(senderId) &&
          String(receiverTx.user_id) === String(receiverId) &&
          senderTx.type === 'DEBIT' &&
          receiverTx.type === 'CREDIT' &&
          senderTx.status === 'success' &&
          receiverTx.status === 'success' &&
          amountMatches &&
          currencyMatches &&
          senderTx.description === expectedSenderDescription &&
          receiverTx.description === expectedReceiverDescription &&
          String(senderTx.currency_id) === String(receiverTx.currency_id);

        if (!samePayload) {
          throw new Error('IDEMPOTENCY_KEY_REUSED: this transfer key was already used with a different payload');
        }
        if (!senderTx.ledger_id || !receiverTx.ledger_id) {
          throw new Error('IDEMPOTENCY_LEDGER_INCOMPLETE: transfer ledger records are incomplete; manual reconciliation is required');
        }

        // Reconstruct the original response from immutable transaction/ledger
        // records. Do not mutate balances or publish duplicate balance events.
        return {
          success: true,
          message: 'Transfer successful',
          sender: {
            walletId: senderTx.wallet_id,
            userId: senderId,
            balance: Number(senderTx.balance_after),
            availableBalance: Number(senderTx.available_after),
            frozenBalance: Number(senderTx.frozen_after),
            transactionId: senderTx.id
          },
          receiver: {
            walletId: receiverTx.wallet_id,
            userId: receiverId,
            balance: Number(receiverTx.balance_after),
            availableBalance: Number(receiverTx.available_after),
            frozenBalance: Number(receiverTx.frozen_after),
            transactionId: receiverTx.id
          },
          amount: Number(senderTx.amount),
          currencyId,
          description: description || 'Internal transfer',
          referenceId,
          events: []
        };
      }
    }
    // 1. بازیابی کیف پول فرستنده (باید وجود داشته باشد)
    const senderWallet = await Wallet.findByUserAndCurrency(senderId, currencyId, client);
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
    let receiverWallet = await Wallet.findByUserAndCurrency(receiverId, currencyId, client);
    if (!receiverWallet) {
      receiverWallet = await Wallet.create({
        userId: receiverId,
        currencyId,
        walletType: 'user',
        balance: 0,
        availableBalance: 0,
        frozenBalance: 0,
        status: 'active'
      }, client);
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
      status: 'success',
      referenceId: senderReferenceId
    }, client);

    // 8. ثبت تراکنش CREDIT برای گیرنده
    const creditTx = await Transaction.create({
      walletId: receiverWallet.id,
      userId: receiverId,
      amount,
      currencyId,
      type: 'CREDIT',
      description: description || `Transfer from user ${senderId}`,
      status: 'success',
      referenceId: receiverReferenceId
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
      description: description || `Transfer to user ${receiverId}`,
      referenceId: senderReferenceId
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
      description: description || `Transfer from user ${senderId}`,
      referenceId: receiverReferenceId
    }, client);

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
      description: description || 'Internal transfer',
      referenceId,
      events: [
        { walletId: senderWallet.id, userId: senderId, amount, type: 'DEBIT', availableBalance: senderAvailableAfter, frozenBalance: senderFrozenAfter, transactionId: debitTx.id, description: description || `Transfer to user ${receiverId}` },
        { walletId: receiverWallet.id, userId: receiverId, amount, type: 'CREDIT', availableBalance: receiverAvailableAfter, frozenBalance: receiverFrozenAfter, transactionId: creditTx.id, description: description || `Transfer from user ${senderId}` },
      ]
    };
  });

  for (const event of result.events) {
    try {
      publishBalanceChangedEvent(
        event.walletId, event.userId, event.amount, event.type, currencyId,
        event.availableBalance, event.frozenBalance, event.transactionId, event.description
      );
    } catch (error) {
      console.error('[WalletService] Failed to publish WalletBalanceChanged after transfer commit:', error && error.message);
    }
  }
  const { events, ...publicResult } = result;
  return publicResult;
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

  const result = await pg.transaction(async (client) => {
    // 1. دریافت کیف پول
    const wallet = await Wallet.findByUserAndCurrency(userId, currencyId, client);
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
      description: description || 'Funds frozen',
      event: {
        walletId: wallet.id, userId, amount, currencyId,
        availableBalance: availableAfter, frozenBalance: frozenAfter,
        transactionId: tx.id, description: description || 'Funds frozen',
      }
    };
  });

  try {
    const event = result.event;
    publishBalanceChangedEvent(
      event.walletId, event.userId, event.amount, 'DEBIT', event.currencyId,
      event.availableBalance, event.frozenBalance, event.transactionId, event.description
    );
  } catch (error) {
    console.error('[WalletService] Failed to publish WalletBalanceChanged after freeze commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
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

  const result = await pg.transaction(async (client) => {
    // 1. بررسی Idempotency
    if (referenceId) {
      const existingTx = await Transaction.findByReferenceId(referenceId, client);
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
      referenceId,
      event: {
        walletId: wallet.id, userId, amount, currencyId,
        availableBalance: availableAfter, frozenBalance: frozenAfter,
        transactionId: tx.id, description: reason || 'Hold released',
      }
    };
  });

  try {
    const event = result.event;
    publishBalanceChangedEvent(
      event.walletId, event.userId, event.amount, 'CREDIT', event.currencyId,
      event.availableBalance, event.frozenBalance, event.transactionId, event.description
    );
  } catch (error) {
    console.error('[WalletService] Failed to publish WalletBalanceChanged after hold release commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
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
    const escrowWallet = await Wallet.findById(escrowWalletId, client);
    if (!escrowWallet) {
      throw new Error(`Escrow wallet not found: ${escrowWalletId}`);
    }

    const escrowFrozen = parseFloat(escrowWallet.frozen_balance);

    // 2. محاسبه کمیسیون سمت سرور (هرگز از بدی درخواست)
    const commissionRates = (config.trip && config.trip.commissionRates) || {};
    const configuredRate = serviceType && commissionRates[serviceType] != null
      ? Number(commissionRates[serviceType])
      : Number(commissionRates.urban_taxi);
    const rate = Number.isFinite(configuredRate) ? configuredRate : 10;
    if (!Number.isFinite(escrowFrozen) || escrowFrozen <= 0) {
      throw new Error('Escrow wallet has no positive frozen balance to release');
    }
    if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
      throw new Error('Escrow commission rate must be a finite percentage from 0 up to, but not including, 100');
    }
    const platformCommission = (escrowFrozen * rate) / 100;
    const netAmount = escrowFrozen - platformCommission;

    // 3. دریافت یا ایجاد کیف پول گیرنده
    const recipientWallet = await getOrCreateWallet(client, recipientId, currencyId);

    // 4. دریافت کیف پول سیستمی پلتفرم فقط زمانی که کمیسیون باید ثبت شود.
    const platformWallet = platformCommission > 0
      ? await getPlatformWallet(client, currencyId)
      : null;

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
    const recipientBalanceBefore = parseFloat(recipientWallet.balance);
    const recipientAvailableBefore = parseFloat(recipientWallet.available_balance);
    const recipientFrozenBefore = parseFloat(recipientWallet.frozen_balance);
    const updatedRecipient = await Wallet.creditAvailableBalance(recipientWallet.id, netAmount, client);
    if (!updatedRecipient) {
      throw new Error('Failed to credit recipient');
    }

    const recipientBalanceAfter = parseFloat(updatedRecipient.balance);
    const recipientAvailableAfter = parseFloat(updatedRecipient.available_balance);

    // 8. ثبت کارمزد پلتفرم؛ اگر کیف پول مقصد موجود نباشد، کل تسویه باید rollback شود.
    let platformTx = null;
    if (platformCommission > 0) {
      if (!platformWallet) {
        throw new Error('Platform wallet not found; cannot safely settle escrow commission');
      }
      const platformBalanceBefore = parseFloat(platformWallet.balance);
      const platformAvailableBefore = parseFloat(platformWallet.available_balance);
      const platformFrozenBefore = parseFloat(platformWallet.frozen_balance);
      const updatedPlatform = await Wallet.creditAvailableBalance(platformWallet.id, platformCommission, client);
      if (!updatedPlatform) throw new Error('Failed to credit platform escrow commission');
      const platformBalanceAfter = parseFloat(updatedPlatform.balance);
      const platformAvailableAfter = parseFloat(updatedPlatform.available_balance);
      const platformFrozenAfter = parseFloat(updatedPlatform.frozen_balance);

      platformTx = await Transaction.create({
        walletId: platformWallet.id,
        userId: platformWallet.user_id,
        amount: platformCommission,
        currencyId,
        type: 'CREDIT',
        description: description || 'Escrow release - platform commission',
        status: 'success'
      }, client);

      await Transaction.createLedgerEntry({
        walletId: platformWallet.id,
        transactionId: platformTx.id,
        creditAmount: platformCommission,
        debitAmount: 0,
        currencyId,
        balanceBefore: platformBalanceBefore,
        balanceAfter: platformBalanceAfter,
        availableBefore: platformAvailableBefore,
        availableAfter: platformAvailableAfter,
        frozenBefore: platformFrozenBefore,
        frozenAfter: platformFrozenAfter,
        operationType: 'escrow_commission',
        description: description || 'Escrow platform commission'
      }, client);
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
      balanceBefore: recipientBalanceBefore,
      balanceAfter: recipientBalanceAfter,
      availableBefore: recipientAvailableBefore,
      availableAfter: recipientAvailableAfter,
      frozenBefore: recipientFrozenBefore,
      frozenAfter: recipientFrozenBefore,
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
        recipient: recipientTx.id,
        platformCommission: platformTx?.id || null
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

  const referenceId = `REFUND-${originalTransactionId}`;
  const result = await pg.transaction(async (client) => {
    // Lock the original transaction so concurrent refund requests serialize.
    const originalResult = await client.query(
      `SELECT
         t.id, t.wallet_id, t.trip_id, t.user_id, t.amount, t.currency_id,
         t.type, t.description, t.status, t.reference_id, t.created_at,
         EXISTS (
           SELECT 1
           FROM wallet_ledger wl
           WHERE wl.transaction_id = t.id
             AND wl.operation_type IN ('transfer_out', 'trip_payment', 'escrow_release')
         ) AS is_multi_party_debit
       FROM transactions t
       WHERE t.id = $1
       FOR UPDATE OF t`,
      [originalTransactionId]
    );
    const originalTx = originalResult.rows[0];
    if (!originalTx) throw new Error(`Original transaction not found: ${originalTransactionId}`);
    if (originalTx.type !== 'DEBIT' || originalTx.status !== 'success') {
      throw new Error('Only successful debit transactions can be refunded');
    }

    // A generic one-wallet credit is not a valid reversal for a multi-party
    // operation: it would leave the receiver/platform credited and create money.
    // Those flows must use their own coordinated reversal lifecycle.
    const originalReferenceId = String(originalTx.reference_id || '');
    const multiPartyReference =
      originalReferenceId.startsWith('trip-payment:') ||
      originalReferenceId.startsWith('escrow-release:') ||
      originalReferenceId.startsWith('wallet-transfer:') ||
      originalReferenceId.endsWith(':sender') ||
      originalReferenceId.endsWith(':passenger');
    if (originalTx.is_multi_party_debit === true || originalTx.is_multi_party_debit === 't' || multiPartyReference) {
      throw new Error('MULTI_PARTY_REFUND_REQUIRES_REVERSAL: this debit belongs to a multi-party settlement; use its workflow-specific reversal');
    }

    const existingRefund = await Transaction.findByReferenceId(referenceId, client);
    if (existingRefund) {
      throw new Error(`Duplicate refund: referenceId '${referenceId}' already exists`);
    }

    const wallet = await Wallet.findById(originalTx.wallet_id, client);
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
      status: 'success', referenceId
    }, client);

    await Transaction.createLedgerEntry({
      walletId: wallet.id, transactionId: refundTx.id, creditAmount: amount, debitAmount: 0,
      currencyId, balanceBefore, balanceAfter, availableBefore, availableAfter, frozenBefore, frozenAfter,
      operationType: 'refund', description: reason || 'Customer refund',
      referenceId
    }, client);

    return {
      success: true, message: 'Refund processed successfully',
      walletId: wallet.id, userId: originalTx.user_id, amount, currencyId,
      availableBalance: availableAfter, originalTransactionId, refundTransactionId: refundTx.id,
      reason: reason || 'Customer refund',
      event: {
        walletId: wallet.id, userId: originalTx.user_id, amount, currencyId,
        availableBalance: availableAfter, frozenBalance: frozenAfter,
        transactionId: refundTx.id, description: reason || 'Refund',
      },
    };
  });

  // Publish after commit so subscribers never observe a rolled-back refund.
  try {
    const event = result.event;
    publishBalanceChangedEvent(
      event.walletId, event.userId, event.amount, 'CREDIT', event.currencyId,
      event.availableBalance, event.frozenBalance, event.transactionId, event.description
    );
  } catch (error) {
    console.error('[WalletService] Failed to publish WalletBalanceChanged after refund commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
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
 * @param {string} params.serviceType - نوع سرویس برای تعیین کمیسیون از تنظیمات سمت سرور
 * @param {string} params.tripId - شناسه سفر (اختیاری)
 * @param {string} params.description - توضیحات
 * @returns {Object} escrow created
 */
async function createEscrow({
  payerId, payeeId, amount, currencyId = 'IRT', tripId = null,
  description = '', serviceType = 'urban_taxi',
} = {}) {
  validateAmount(amount);
  validateCurrency(currencyId);
  if (!payerId) throw new Error('Payer ID is required');

  // Commission is resolved only from trusted server configuration. Any
  // caller-supplied platformCommission field is intentionally ignored.
  const commissionRates = (config.trip && config.trip.commissionRates) || {};
  const configuredRate = serviceType && commissionRates[serviceType] != null
    ? Number(commissionRates[serviceType])
    : Number(commissionRates.general ?? commissionRates.urban_taxi);
  const rate = Number.isFinite(configuredRate) ? configuredRate : 10;
  if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
    throw new Error('Escrow commission rate must be a finite percentage greater than or equal to 0 and less than 100');
  }
  const commission = Number((amount * rate / 100).toFixed(8));
  const netAmount = Number((amount - commission).toFixed(8));
  const freezeReferenceId = tripId ? `escrow-create:${tripId}:freeze` : null;

  const result = await pg.transaction(async (client) => {
    // Freeze the payer's funds and create the escrow record in the SAME
    // PostgreSQL transaction. Do not call freezeFunds(), which opens a nested
    // transaction and could commit the freeze without the escrow record.
    const payerWallet = await Wallet.findByUserAndCurrency(payerId, currencyId, client);
    if (!payerWallet) throw new Error(`Payer wallet not found: ${payerId}`);
    if (payerWallet.status !== 'active') {
      throw new Error(`Wallet is ${payerWallet.status}. Cannot freeze funds.`);
    }

    const balanceBefore = parseFloat(payerWallet.balance);
    const availableBefore = parseFloat(payerWallet.available_balance);
    const frozenBefore = parseFloat(payerWallet.frozen_balance);
    if (availableBefore < amount) {
      throw new Error(`Insufficient available balance to freeze. Required: ${amount} ${currencyId}, Available: ${availableBefore} ${currencyId}`);
    }

    const updatedWallet = await Wallet.freezeAvailable(payerWallet.id, amount, client);
    if (!updatedWallet) throw new Error('Failed to freeze escrow funds. Possible race condition.');

    const balanceAfter = parseFloat(updatedWallet.balance);
    const availableAfter = parseFloat(updatedWallet.available_balance);
    const frozenAfter = parseFloat(updatedWallet.frozen_balance);

    const freezeTx = await Transaction.create({
      walletId: payerWallet.id,
      userId: payerId,
      tripId,
      amount,
      currencyId,
      type: 'DEBIT',
      description: `Escrow: ${description || 'Trip payment'}`,
      status: 'pending',
      referenceId: freezeReferenceId,
    }, client);

    await Transaction.createLedgerEntry({
      walletId: payerWallet.id,
      transactionId: freezeTx.id,
      creditAmount: 0,
      debitAmount: 0,
      currencyId,
      balanceBefore,
      balanceAfter,
      availableBefore,
      availableAfter,
      frozenBefore,
      frozenAfter,
      operationType: 'escrow_freeze',
      description: `Escrow: ${description || 'Trip payment'}`,
      referenceId: freezeReferenceId,
    }, client);

    const platformWallet = commission > 0
      ? await getPlatformWallet(client, currencyId)
      : null;

    const escrow = await Escrow.create({
      tripId, payerId, payeeId: payeeId || null,
      amount, currencyId, platformCommission: commission, netAmount,
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
      platformCommission: commission,
      netAmount,
      transactionId: freezeTx.id,
      event: {
        walletId: payerWallet.id,
        userId: payerId,
        amount,
        currencyId,
        availableBalance: availableAfter,
        frozenBalance: frozenAfter,
        transactionId: freezeTx.id,
        description: `Escrow: ${description || 'Trip payment'}`,
      },
    };
  });

  try {
    const event = result.event;
    publishBalanceChangedEvent(
      event.walletId, event.userId, event.amount, 'DEBIT', event.currencyId,
      event.availableBalance, event.frozenBalance, event.transactionId, event.description
    );
  } catch (error) {
    console.error('[WalletService] Failed to publish WalletBalanceChanged after escrow creation commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
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

  const result = await pg.transaction(async (client) => {
    const escrow = await Escrow.findById(escrowId, client, true);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
    if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);
    if (!escrow.payee_id) throw new Error('Escrow has no payee assigned. Use assignPayee first.');

    const amount = Number(escrow.amount);
    const platformCommission = Number(escrow.platform_commission);
    const netAmount = Number(escrow.net_amount);
    const currencyId = escrow.currency_id;
    if (!Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(platformCommission) || platformCommission < 0 ||
        !Number.isFinite(netAmount) || netAmount < 0 ||
        Math.abs(amount - platformCommission - netAmount) > 0.00000001) {
      throw new Error('Escrow amounts are invalid or do not reconcile');
    }

    const sourceWallet = await Wallet.findById(escrow.source_wallet_id, client);
    if (!sourceWallet) throw new Error('Source wallet not found');

    const srcBalanceBefore = Number(sourceWallet.balance);
    const srcAvailableBefore = Number(sourceWallet.available_balance);
    const srcFrozenBefore = Number(sourceWallet.frozen_balance);
    const updatedSrc = await Wallet.deductFrozen(sourceWallet.id, amount, client);
    if (!updatedSrc) throw new Error('Failed to deduct frozen amount from payer wallet');
    const srcBalanceAfter = Number(updatedSrc.balance);
    const srcAvailableAfter = Number(updatedSrc.available_balance);
    const srcFrozenAfter = Number(updatedSrc.frozen_balance);

    const payeeWallet = await getOrCreateWallet(client, escrow.payee_id, currencyId);
    const payeeBalanceBefore = Number(payeeWallet.balance);
    const payeeAvailableBefore = Number(payeeWallet.available_balance);
    const payeeFrozenBefore = Number(payeeWallet.frozen_balance);
    const updatedPayee = await Wallet.creditAvailableBalance(payeeWallet.id, netAmount, client);
    if (!updatedPayee) throw new Error('Failed to credit payee wallet');
    const payeeBalanceAfter = Number(updatedPayee.balance);
    const payeeAvailableAfter = Number(updatedPayee.available_balance);
    const payeeFrozenAfter = Number(updatedPayee.frozen_balance);

    let platformTx = null;
    let platformBalanceEvent = null;
    if (platformCommission > 0) {
      if (!escrow.platform_wallet_id) {
        throw new Error('Platform wallet is not configured on escrow; refusing to lose commission');
      }
      const platformWallet = await Wallet.findById(escrow.platform_wallet_id, client);
      if (!platformWallet || platformWallet.wallet_type !== 'platform' || platformWallet.status !== 'active') {
        throw new Error('Configured escrow platform wallet is missing, inactive, or not a platform wallet');
      }
      const platformBalanceBefore = Number(platformWallet.balance);
      const platformAvailableBefore = Number(platformWallet.available_balance);
      const platformFrozenBefore = Number(platformWallet.frozen_balance);
      const updatedPlatform = await Wallet.creditAvailableBalance(platformWallet.id, platformCommission, client);
      if (!updatedPlatform) throw new Error('Failed to credit platform escrow commission');
      const platformBalanceAfter = Number(updatedPlatform.balance);
      const platformAvailableAfter = Number(updatedPlatform.available_balance);
      const platformFrozenAfter = Number(updatedPlatform.frozen_balance);
      const platformReferenceId = `escrow-release:${escrow.id}:platform`;

      platformTx = await Transaction.create({
        walletId: platformWallet.id,
        userId: null,
        tripId: escrow.trip_id,
        amount: platformCommission,
        currencyId,
        type: 'CREDIT',
        description: `Escrow commission for ${escrow.id}`,
        status: 'success',
        referenceId: platformReferenceId,
      }, client);
      await Transaction.createLedgerEntry({
        walletId: platformWallet.id,
        transactionId: platformTx.id,
        creditAmount: platformCommission,
        debitAmount: 0,
        currencyId,
        balanceBefore: platformBalanceBefore,
        balanceAfter: platformBalanceAfter,
        availableBefore: platformAvailableBefore,
        availableAfter: platformAvailableAfter,
        frozenBefore: platformFrozenBefore,
        frozenAfter: platformFrozenAfter,
        operationType: 'escrow_commission',
        description: `Escrow commission for ${escrow.id}`,
        referenceId: platformReferenceId,
      }, client);
      platformBalanceEvent = {
        walletId: platformWallet.id, userId: null, amount: platformCommission, type: 'CREDIT',
        availableBalance: platformAvailableAfter, frozenBalance: platformFrozenAfter,
        transactionId: platformTx.id, description: `Escrow commission for ${escrow.id}`,
      };
    }

    const payerReferenceId = `escrow-release:${escrow.id}:payer`;
    const payeeReferenceId = `escrow-release:${escrow.id}:payee`;
    const debitTx = await Transaction.create({
      walletId: sourceWallet.id,
      userId: escrow.payer_id,
      tripId: escrow.trip_id,
      amount,
      currencyId,
      type: 'DEBIT',
      description: `Escrow released to user ${escrow.payee_id}`,
      status: 'success',
      referenceId: payerReferenceId,
    }, client);
    const creditTx = await Transaction.create({
      walletId: payeeWallet.id,
      userId: escrow.payee_id,
      tripId: escrow.trip_id,
      amount: netAmount,
      currencyId,
      type: 'CREDIT',
      description: `Escrow payment from user ${escrow.payer_id}`,
      status: 'success',
      referenceId: payeeReferenceId,
    }, client);

    await Transaction.createLedgerEntry({
      walletId: sourceWallet.id,
      transactionId: debitTx.id,
      creditAmount: 0,
      debitAmount: amount,
      currencyId,
      balanceBefore: srcBalanceBefore,
      balanceAfter: srcBalanceAfter,
      availableBefore: srcAvailableBefore,
      availableAfter: srcAvailableAfter,
      frozenBefore: srcFrozenBefore,
      frozenAfter: srcFrozenAfter,
      operationType: 'escrow_release',
      description: `Escrow released - payer ${escrow.payer_id}`,
      referenceId: payerReferenceId,
    }, client);
    await Transaction.createLedgerEntry({
      walletId: payeeWallet.id,
      transactionId: creditTx.id,
      creditAmount: netAmount,
      debitAmount: 0,
      currencyId,
      balanceBefore: payeeBalanceBefore,
      balanceAfter: payeeBalanceAfter,
      availableBefore: payeeAvailableBefore,
      availableAfter: payeeAvailableAfter,
      frozenBefore: payeeFrozenBefore,
      frozenAfter: payeeFrozenAfter,
      operationType: 'escrow_release',
      description: `Escrow released - payee ${escrow.payee_id}`,
      referenceId: payeeReferenceId,
    }, client);

    const updatedEscrow = await Escrow.updateStatus(escrow.id, 'released', {
      destination_wallet_id: payeeWallet.id,
    }, client);
    if (!updatedEscrow) throw new Error('Failed to mark escrow as released');

    const balanceEvents = [
      {
        walletId: sourceWallet.id, userId: escrow.payer_id, amount, type: 'DEBIT',
        availableBalance: srcAvailableAfter, frozenBalance: srcFrozenAfter,
        transactionId: debitTx.id, description: `Escrow released - payer ${escrow.payer_id}`,
      },
      {
        walletId: payeeWallet.id, userId: escrow.payee_id, amount: netAmount, type: 'CREDIT',
        availableBalance: payeeAvailableAfter, frozenBalance: payeeFrozenAfter,
        transactionId: creditTx.id, description: `Escrow released - payee ${escrow.payee_id}`,
      },
    ];
    if (platformBalanceEvent) balanceEvents.push(platformBalanceEvent);

    return {
      success: true,
      message: 'Escrow released successfully',
      escrowId: escrow.id,
      status: 'released',
      payee: { walletId: payeeWallet.id, amount: netAmount, balance: payeeBalanceAfter },
      platformCommission,
      transactionIds: {
        escrow: debitTx.id,
        recipient: creditTx.id,
        platformCommission: platformTx ? platformTx.id : null,
      },
      balanceEvents,
      event: {
        escrowId: escrow.id, payerId: escrow.payer_id, payeeId: escrow.payee_id,
        amount, netAmount, platformCommission, currencyId,
      },
    };
  });

  // Publish only after the database transaction has committed.
  for (const event of result.balanceEvents) {
    try {
      publishBalanceChangedEvent(
        event.walletId, event.userId, event.amount, event.type, result.event.currencyId,
        event.availableBalance, event.frozenBalance, event.transactionId, event.description
      );
    } catch (error) {
      console.error('[WalletService] Failed to publish WalletBalanceChanged after escrow release:', error && error.message);
    }
  }
  try {
    eventBus.publish('EscrowReleased', { ...result.event, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[WalletService] Failed to publish EscrowReleased after commit:', error && error.message);
  }
  const { event, balanceEvents, ...publicResult } = result;
  return publicResult;
}

/**
 * [مرحله ۳] بازگشت Escrow (زمانی که سفر لغو شود)
 * 
 * وجه frozen را به available برمی‌گرداند
 */
async function refundEscrow(escrowId, reason = '') {
  if (!escrowId) throw new Error('Escrow ID is required');

  const result = await pg.transaction(async (client) => {
    const escrow = await Escrow.findById(escrowId, client, true);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
    if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);

    const amount = Number(escrow.amount);
    const currencyId = escrow.currency_id;
    if (!Number.isFinite(amount) || amount <= 0 || !currencyId) {
      throw new Error('Escrow amount or currency is invalid');
    }

    // Verify the actual source wallet before moving funds so the audit record
    // captures real balances and cannot silently credit a mismatched payer wallet.
    const sourceWallet = await Wallet.findById(escrow.source_wallet_id, client);
    if (!sourceWallet) throw new Error('Escrow source wallet not found');
    if (String(sourceWallet.user_id) !== String(escrow.payer_id) ||
        String(sourceWallet.currency_id) !== String(currencyId)) {
      throw new Error('Escrow source wallet owner or currency does not match escrow');
    }
    const balanceBefore = Number(sourceWallet.balance);
    const availableBefore = Number(sourceWallet.available_balance);
    const frozenBefore = Number(sourceWallet.frozen_balance);
    if (![balanceBefore, availableBefore, frozenBefore].every(Number.isFinite) ||
        frozenBefore < amount) {
      throw new Error('Escrow source wallet balances are invalid or insufficient');
    }

    // Unfreeze: frozen -> available; total balance must not change.
    const updatedWallet = await Wallet.unfreezeFrozen(escrow.source_wallet_id, amount, client);
    if (!updatedWallet) throw new Error('Failed to unfreeze escrow funds');
    const balanceAfter = Number(updatedWallet.balance);
    const availableAfter = Number(updatedWallet.available_balance);
    const frozenAfter = Number(updatedWallet.frozen_balance);
    if (![balanceAfter, availableAfter, frozenAfter].every(Number.isFinite) ||
        Math.abs(balanceAfter - balanceBefore) > 0.000001 ||
        Math.abs((availableAfter - availableBefore) - amount) > 0.000001 ||
        Math.abs((frozenBefore - frozenAfter) - amount) > 0.000001) {
      throw new Error('Escrow refund wallet balance transition is inconsistent');
    }

    // ثبت دفتر کل
    const tx = await Transaction.create({
      walletId: escrow.source_wallet_id, userId: escrow.payer_id,
      amount, currencyId, type: 'CREDIT',
      description: `Escrow refund: ${reason || 'Trip cancelled'}`, status: 'success'
    }, client);

    await Transaction.createLedgerEntry({
      walletId: escrow.source_wallet_id, transactionId: tx.id,
      // This is a reclassification from frozen to available, not new money.
      creditAmount: 0, debitAmount: 0, currencyId,
      balanceBefore, balanceAfter, availableBefore, availableAfter, frozenBefore, frozenAfter,
      operationType: 'refund',
      description: reason || 'Escrow refunded'
    }, client);

    const updatedEscrow = await Escrow.updateStatus(escrow.id, 'refunded', {}, client);

    return { success: true, message: 'Escrow refunded successfully',
      escrowId: escrow.id, status: 'refunded', amount,
      event: { escrowId: escrow.id, payerId: escrow.payer_id, amount, currencyId, reason } };
  });

  try {
    eventBus.publish('EscrowRefunded', { ...result.event, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[WalletService] Failed to publish EscrowRefunded after commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
}

/**
 * [مرحله ۴] انقضای Escrow (زمانبندی خودکار)
 * 
 * اگر Escrow بعد از مدت مشخصی آزاد نشود، وجه به payer برمی‌گردد
 */
async function expireEscrow(escrowId) {
  if (!escrowId) throw new Error('Escrow ID is required');

  const result = await pg.transaction(async (client) => {
    const escrow = await Escrow.findById(escrowId, client, true);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);
    if (escrow.status !== 'active') throw new Error(`Escrow is ${escrow.status}, not 'active'`);

    const amount = Number(escrow.amount);
    const currencyId = escrow.currency_id;
    if (!Number.isFinite(amount) || amount <= 0 || !currencyId) {
      throw new Error('Escrow amount or currency is invalid');
    }

    const sourceWallet = await Wallet.findById(escrow.source_wallet_id, client);
    if (!sourceWallet) throw new Error('Escrow source wallet not found');
    if (String(sourceWallet.user_id) !== String(escrow.payer_id) ||
        String(sourceWallet.currency_id) !== String(currencyId)) {
      throw new Error('Escrow source wallet owner or currency does not match escrow');
    }
    const balanceBefore = Number(sourceWallet.balance);
    const availableBefore = Number(sourceWallet.available_balance);
    const frozenBefore = Number(sourceWallet.frozen_balance);
    if (![balanceBefore, availableBefore, frozenBefore].every(Number.isFinite) ||
        frozenBefore < amount) {
      throw new Error('Escrow source wallet balances are invalid or insufficient');
    }

    const updatedWallet = await Wallet.unfreezeFrozen(escrow.source_wallet_id, amount, client);
    if (!updatedWallet) throw new Error('Failed to unfreeze expired escrow');
    const balanceAfter = Number(updatedWallet.balance);
    const availableAfter = Number(updatedWallet.available_balance);
    const frozenAfter = Number(updatedWallet.frozen_balance);
    if (![balanceAfter, availableAfter, frozenAfter].every(Number.isFinite) ||
        Math.abs(balanceAfter - balanceBefore) > 0.000001 ||
        Math.abs((availableAfter - availableBefore) - amount) > 0.000001 ||
        Math.abs((frozenBefore - frozenAfter) - amount) > 0.000001) {
      throw new Error('Escrow expiry wallet balance transition is inconsistent');
    }

    const tx = await Transaction.create({
      walletId: escrow.source_wallet_id, userId: escrow.payer_id,
      amount, currencyId, type: 'CREDIT',
      description: 'Escrow expired - funds returned', status: 'success'
    }, client);

    await Transaction.createLedgerEntry({
      walletId: escrow.source_wallet_id, transactionId: tx.id,
      // Expiry moves existing funds from frozen to available; it creates no balance.
      creditAmount: 0, debitAmount: 0, currencyId,
      balanceBefore, balanceAfter, availableBefore, availableAfter, frozenBefore, frozenAfter,
      operationType: 'expire',
      description: 'Escrow expired'
    }, client);

    const updatedEscrow = await Escrow.updateStatus(escrow.id, 'expired', {}, client);

    return { success: true, message: 'Escrow expired, funds returned to payer',
      escrowId: escrow.id, status: 'expired', amount,
      event: { escrowId: escrow.id, payerId: escrow.payer_id, amount, currencyId } };
  });

  try {
    eventBus.publish('EscrowExpired', { ...result.event, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[WalletService] Failed to publish EscrowExpired after commit:', error && error.message);
  }
  const { event, ...publicResult } = result;
  return publicResult;
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

/**
 * پردازش پرداخت نهایی سفر (P5-1) — تراکنش اتمیک چندکیف‌پوله.
 *
 * با دریافت رویداد `TripCompleted` فراخوانی می‌شود و در یک تراکنش PostgreSQL:
 *   1. مبلغ `amount` (کرایه نهایی) از کیف پول مسافر کسر میشود (TRIP_PAYMENT)
 *      — در صورت ناکافی بودن موجودی، اجازه منفی شدن (بدهی/Debt) داده میشود.
 *   2. کمیسیون سیستم (از Config خوانده میشود، نه Hardcode) به کیف پول
 *      پلتفرم واریز میشود (TRIP_COMMISSION).
 *   3. مابقی (amount - کمیسیون) به کیف پول راننده واریز میشود (TRIP_REVENUE).
 *
 * Idempotency: referenceId = `trip-payment:<tripId>`.
 */
async function processTripPayment({ tripId, passengerId, driverId, amount, currencyId = 'IRT', commissionRate = null } = {}) {
  validateAmount(amount);
  validateCurrency(currencyId);
  if (!tripId || !passengerId || !driverId) {
    throw new Error('tripId, passengerId and driverId are required for trip payment');
  }

  const configuredCommissionRate = parseFloat((config.trip.commissionRates || {}).general);
  const rate = (commissionRate == null)
    ? (Number.isFinite(configuredCommissionRate) ? configuredCommissionRate : 15)
    : Number(commissionRate);
  if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
    throw new Error('Commission rate must be a finite number greater than or equal to 0 and less than 100');
  }

  const commission = Math.round(amount * (rate / 100));
  const driverAmount = amount - commission;
  const referenceId = `trip-payment:${tripId}`;
  const passengerReferenceId = `${referenceId}:passenger`;
  const platformReferenceId = `${referenceId}:platform`;
  const driverReferenceId = `${referenceId}:driver`;

  const result = await pg.transaction(async (client) => {
    // The transaction table has a unique reference_id index. Check the exact
    // passenger reference and rely on that index to serialize concurrent retries.
    const existing = await Transaction.findByReferenceId(passengerReferenceId, client);
    if (existing) {
      throw new Error(`Duplicate transaction: referenceId '${referenceId}' already exists`);
    }

    // 1) Charge passenger. The DB forbids negative balances, so insufficient funds abort the whole settlement.
    const pWallet = await getOrCreateWallet(client, passengerId, currencyId);
    const pBalBefore = parseFloat(pWallet.balance);
    const pAvailBefore = parseFloat(pWallet.available_balance);
    const pFrozenBefore = parseFloat(pWallet.frozen_balance);

    const pUpdated = await Wallet.debitAvailableBalance(pWallet.id, amount, client);
    if (!pUpdated) throw new Error('Insufficient available balance or inactive passenger wallet');
    const pBalAfter = parseFloat(pUpdated.balance);
    const pAvailAfter = parseFloat(pUpdated.available_balance);
    const pFrozenAfter = parseFloat(pUpdated.frozen_balance);
    const debt = false;

    const pTx = await Transaction.create({
      walletId: pWallet.id, userId: passengerId, tripId,
      amount, currencyId, type: 'DEBIT',
      description: `TRIP_PAYMENT trip ${tripId}`,
      status: 'success',
      referenceId: passengerReferenceId,
    }, client);
    await Transaction.createLedgerEntry({
      walletId: pWallet.id, transactionId: pTx.id,
      creditAmount: 0, debitAmount: amount, currencyId,
      balanceBefore: pBalBefore, balanceAfter: pBalAfter,
      availableBefore: pAvailBefore, availableAfter: pAvailAfter,
      frozenBefore: pFrozenBefore, frozenAfter: pFrozenAfter,
      operationType: 'trip_payment',
      description: `TRIP_PAYMENT trip ${tripId}`,
      referenceId: passengerReferenceId,
    }, client);

    // 2) Credit platform commission.
    let platformCommissionId = null;
    let platformEvent = null;
    if (commission > 0) {
      const plWallet = await getPlatformWallet(client, currencyId);
      const plBalBefore = parseFloat(plWallet.balance);
      const plAvailBefore = parseFloat(plWallet.available_balance);
      const plFrozenBefore = parseFloat(plWallet.frozen_balance);

      const plUpdated = await Wallet.creditAvailableBalance(plWallet.id, commission, client);
      if (!plUpdated) throw new Error('Failed to credit platform commission');
      const plBalAfter = parseFloat(plUpdated.balance);
      const plAvailAfter = parseFloat(plUpdated.available_balance);
      const plFrozenAfter = parseFloat(plUpdated.frozen_balance);

      const plTx = await Transaction.create({
        walletId: plWallet.id, userId: null, tripId,
        amount: commission, currencyId, type: 'CREDIT',
        description: `TRIP_COMMISSION trip ${tripId}`,
        status: 'success',
        referenceId: platformReferenceId,
      }, client);
      await Transaction.createLedgerEntry({
        walletId: plWallet.id, transactionId: plTx.id,
        creditAmount: commission, debitAmount: 0, currencyId,
        balanceBefore: plBalBefore, balanceAfter: plBalAfter,
        availableBefore: plAvailBefore, availableAfter: plAvailAfter,
        frozenBefore: plFrozenBefore, frozenAfter: plFrozenAfter,
        operationType: 'commission',
        description: `TRIP_COMMISSION trip ${tripId}`,
        referenceId: platformReferenceId,
      }, client);
      platformCommissionId = plTx.id;
      platformEvent = {
        walletId: plWallet.id, userId: null, amount: commission, type: 'CREDIT',
        availableBalance: plAvailAfter, frozenBalance: plFrozenAfter,
        transactionId: plTx.id, description: `TRIP_COMMISSION trip ${tripId}`,
      };
    }

    // 3) Credit the driver's net revenue.
    const dWallet = await getOrCreateWallet(client, driverId, currencyId);
    const dBalBefore = parseFloat(dWallet.balance);
    const dAvailBefore = parseFloat(dWallet.available_balance);
    const dFrozenBefore = parseFloat(dWallet.frozen_balance);

    const dUpdated = await Wallet.creditAvailableBalance(dWallet.id, driverAmount, client);
    if (!dUpdated) throw new Error('Failed to credit driver wallet');
    const dBalAfter = parseFloat(dUpdated.balance);
    const dAvailAfter = parseFloat(dUpdated.available_balance);
    const dFrozenAfter = parseFloat(dUpdated.frozen_balance);

    const dTx = await Transaction.create({
      walletId: dWallet.id, userId: driverId, tripId,
      amount: driverAmount, currencyId, type: 'CREDIT',
      description: `TRIP_REVENUE trip ${tripId}`,
      status: 'success',
      referenceId: driverReferenceId,
    }, client);
    await Transaction.createLedgerEntry({
      walletId: dWallet.id, transactionId: dTx.id,
      creditAmount: driverAmount, debitAmount: 0, currencyId,
      balanceBefore: dBalBefore, balanceAfter: dBalAfter,
      availableBefore: dAvailBefore, availableAfter: dAvailAfter,
      frozenBefore: dFrozenBefore, frozenAfter: dFrozenAfter,
      operationType: 'trip_revenue',
      description: `TRIP_REVENUE trip ${tripId}`,
      referenceId: driverReferenceId,
    }, client);

    return {
      success: true,
      message: 'Trip payment processed',
      tripId,
      amount,
      commissionRate: rate,
      commission,
      driverAmount,
      debt,
      referenceId,
      passengerTransactionId: pTx.id,
      driverTransactionId: dTx.id,
      platformCommissionId,
      events: [
        { walletId: pWallet.id, userId: passengerId, amount, type: 'DEBIT', availableBalance: pAvailAfter, frozenBalance: pFrozenAfter, transactionId: pTx.id, description: `TRIP_PAYMENT trip ${tripId}` },
        ...(platformEvent ? [platformEvent] : []),
        { walletId: dWallet.id, userId: driverId, amount: driverAmount, type: 'CREDIT', availableBalance: dAvailAfter, frozenBalance: dFrozenAfter, transactionId: dTx.id, description: `TRIP_REVENUE trip ${tripId}` },
      ],
    };
  });

  // Publish only after PostgreSQL has committed. Event delivery must not make
  // a committed financial operation look like a failed transaction.
  for (const event of result.events) {
    try {
      publishBalanceChangedEvent(
        event.walletId, event.userId, event.amount, event.type, currencyId,
        event.availableBalance, event.frozenBalance, event.transactionId, event.description
      );
    } catch (error) {
      console.error('[WalletService] Failed to publish WalletBalanceChanged after trip settlement:', error && error.message);
    }
  }
  const { events, ...publicResult } = result;
  return publicResult;
}

/**
 * پردازش جریمه لغو سفر (P7-1) — تراکنش اتمیک چندکیفپوله.
 *
 * با دریافت رویداد کانونیک `TripCancelled` فراخوانی میشود و در یک تراکنش:
 *   1. مبلغ `penaltyAmount` از کیف پول مسافر کسر میشود (CANCELLATION_PENALTY).
 *      موجودی منفی مجاز نیست؛ در صورت کمبود موجودی، کل تسویه لغو می‌شود.
 *   2. سهم راننده (driverShare٪ از Config: wallet.cancellationDriverShare)
 *      به کیف پول راننده واریز میشود (CANCELLATION_COMPENSATION).
 *   3. مابقی به کیف پول پلتفرم واریز میشود (CANCELLATION_PLATFORM_SHARE).
 *
 * Idempotency: referenceId = `trip-penalty:<tripId>`.
 */
async function processCancellationPenalty({
  tripId, passengerId, driverId, penaltyAmount, currencyId = 'IRT', driverShare = null,
} = {}) {
  validateAmount(penaltyAmount);
  validateCurrency(currencyId);
  if (!tripId || !passengerId) {
    throw new Error('tripId and passengerId are required for cancellation penalty');
  }

  const referenceId = `trip-penalty:${tripId}`;
  const passengerReferenceId = `${referenceId}:passenger`;
  const driverReferenceId = `${referenceId}:driver`;
  const platformReferenceId = `${referenceId}:platform`;
  const configuredDriverShare = parseFloat((config.wallet || {}).cancellationDriverShare);
  const sharePct = (driverShare == null)
    ? (Number.isFinite(configuredDriverShare) ? configuredDriverShare : 80)
    : Number(driverShare);
  if (!Number.isFinite(sharePct) || sharePct < 0 || sharePct > 100) {
    throw new Error('Driver share must be a finite number between 0 and 100');
  }

  const result = await pg.transaction(async (client) => {
    const existing = await Transaction.findByReferenceId(passengerReferenceId, client);
    if (existing) {
      throw new Error(`Duplicate transaction: referenceId '${referenceId}' already exists`);
    }

    const pWallet = await getOrCreateWallet(client, passengerId, currencyId);
    const pBalBefore = parseFloat(pWallet.balance);
    const pAvailBefore = parseFloat(pWallet.available_balance);
    const pFrozenBefore = parseFloat(pWallet.frozen_balance);
    const pUpdated = await Wallet.debitAvailableBalance(pWallet.id, penaltyAmount, client);
    if (!pUpdated) throw new Error('Insufficient available balance or inactive passenger wallet for cancellation penalty');
    const pBalAfter = parseFloat(pUpdated.balance);
    const pAvailAfter = parseFloat(pUpdated.available_balance);
    const pFrozenAfter = parseFloat(pUpdated.frozen_balance);
    const debt = false;

    const pTx = await Transaction.create({
      walletId: pWallet.id, userId: passengerId, tripId,
      amount: penaltyAmount, currencyId, type: 'DEBIT',
      description: `CANCELLATION_PENALTY trip ${tripId}`,
      status: 'success',
      referenceId: passengerReferenceId,
    }, client);
    await Transaction.createLedgerEntry({
      walletId: pWallet.id, transactionId: pTx.id,
      creditAmount: 0, debitAmount: penaltyAmount, currencyId,
      balanceBefore: pBalBefore, balanceAfter: pBalAfter,
      availableBefore: pAvailBefore, availableAfter: pAvailAfter,
      frozenBefore: pFrozenBefore, frozenAfter: pFrozenAfter,
      operationType: 'cancellation_penalty',
      description: `CANCELLATION_PENALTY trip ${tripId}`,
      referenceId: passengerReferenceId,
    }, client);

    const events = [{
      walletId: pWallet.id, userId: passengerId, amount: penaltyAmount, type: 'DEBIT',
      availableBalance: pAvailAfter, frozenBalance: pFrozenAfter, transactionId: pTx.id,
      description: `CANCELLATION_PENALTY trip ${tripId}`,
    }];

    // If no driver is assigned, no driver share is allocated; the platform receives the full penalty.
    const driverCompensation = driverId ? Math.round(penaltyAmount * (sharePct / 100)) : 0;
    let driverCompensationId = null;
    if (driverId && driverCompensation > 0) {
      const dWallet = await getOrCreateWallet(client, driverId, currencyId);
      const dBalBefore = parseFloat(dWallet.balance);
      const dAvailBefore = parseFloat(dWallet.available_balance);
      const dFrozenBefore = parseFloat(dWallet.frozen_balance);
      const dUpdated = await Wallet.creditAvailableBalance(dWallet.id, driverCompensation, client);
      if (!dUpdated) throw new Error('Failed to credit driver cancellation compensation');
      const dBalAfter = parseFloat(dUpdated.balance);
      const dAvailAfter = parseFloat(dUpdated.available_balance);
      const dFrozenAfter = parseFloat(dUpdated.frozen_balance);

      const dTx = await Transaction.create({
        walletId: dWallet.id, userId: driverId, tripId,
        amount: driverCompensation, currencyId, type: 'CREDIT',
        description: `CANCELLATION_COMPENSATION trip ${tripId} (${sharePct}% of ${penaltyAmount})`,
        status: 'success', referenceId: driverReferenceId,
      }, client);
      await Transaction.createLedgerEntry({
        walletId: dWallet.id, transactionId: dTx.id,
        creditAmount: driverCompensation, debitAmount: 0, currencyId,
        balanceBefore: dBalBefore, balanceAfter: dBalAfter,
        availableBefore: dAvailBefore, availableAfter: dAvailAfter,
        frozenBefore: dFrozenBefore, frozenAfter: dFrozenAfter,
        operationType: 'cancellation_compensation',
        description: `CANCELLATION_COMPENSATION trip ${tripId}`,
        referenceId: driverReferenceId,
      }, client);
      driverCompensationId = dTx.id;
      events.push({
        walletId: dWallet.id, userId: driverId, amount: driverCompensation, type: 'CREDIT',
        availableBalance: dAvailAfter, frozenBalance: dFrozenAfter, transactionId: dTx.id,
        description: `CANCELLATION_COMPENSATION trip ${tripId}`,
      });
    }

    const platformShare = Math.max(0, penaltyAmount - driverCompensation);
    let platformShareId = null;
    if (platformShare > 0) {
      const plWallet = await getPlatformWallet(client, currencyId);
      const plBalBefore = parseFloat(plWallet.balance);
      const plAvailBefore = parseFloat(plWallet.available_balance);
      const plFrozenBefore = parseFloat(plWallet.frozen_balance);
      const plUpdated = await Wallet.creditAvailableBalance(plWallet.id, platformShare, client);
      if (!plUpdated) throw new Error('Failed to credit platform cancellation share');
      const plBalAfter = parseFloat(plUpdated.balance);
      const plAvailAfter = parseFloat(plUpdated.available_balance);
      const plFrozenAfter = parseFloat(plUpdated.frozen_balance);

      const plTx = await Transaction.create({
        walletId: plWallet.id, userId: null, tripId,
        amount: platformShare, currencyId, type: 'CREDIT',
        description: `CANCELLATION_PLATFORM_SHARE trip ${tripId}`,
        status: 'success', referenceId: platformReferenceId,
      }, client);
      await Transaction.createLedgerEntry({
        walletId: plWallet.id, transactionId: plTx.id,
        creditAmount: platformShare, debitAmount: 0, currencyId,
        balanceBefore: plBalBefore, balanceAfter: plBalAfter,
        availableBefore: plAvailBefore, availableAfter: plAvailAfter,
        frozenBefore: plFrozenBefore, frozenAfter: plFrozenAfter,
        operationType: 'cancellation_platform_share',
        description: `CANCELLATION_PLATFORM_SHARE trip ${tripId}`,
        referenceId: platformReferenceId,
      }, client);
      platformShareId = plTx.id;
      events.push({
        walletId: plWallet.id, userId: null, amount: platformShare, type: 'CREDIT',
        availableBalance: plAvailAfter, frozenBalance: plFrozenAfter, transactionId: plTx.id,
        description: `CANCELLATION_PLATFORM_SHARE trip ${tripId}`,
      });
    }

    return {
      success: true,
      message: 'Cancellation penalty processed',
      tripId,
      penaltyAmount,
      driverSharePct: sharePct,
      driverCompensation,
      platformShare,
      debt,
      referenceId,
      passengerTransactionId: pTx.id,
      driverCompensationId,
      platformShareId,
      events,
    };
  });

  // Do not publish balance events until the database transaction has committed.
  for (const event of result.events) {
    try {
      publishBalanceChangedEvent(
        event.walletId, event.userId, event.amount, event.type, currencyId,
        event.availableBalance, event.frozenBalance, event.transactionId, event.description
      );
    } catch (error) {
      console.error('[WalletService] Failed to publish WalletBalanceChanged after cancellation settlement:', error && error.message);
    }
  }
  const { events, ...publicResult } = result;
  return publicResult;
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
  processTripPayment,
  processCancellationPenalty,
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

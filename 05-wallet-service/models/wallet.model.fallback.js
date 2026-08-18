/**
 * wallet.model.fallback.js - In-Memory Fallback for Wallet Model
 * 
 * زمانی که PostgreSQL در دسترس نیست، این ماژول به عنوان جایگزین
 * درون‌حافظه‌ای استفاده می‌شود تا سرویس و تست‌ها بدون وقفه کار کنند.
 */

const crypto = require('crypto');

// In-memory storage
const wallets = new Map();
const transactions = new Map();
const escrows = new Map();
const ledgerEntries = [];

function generateId() {
  return crypto.randomUUID();
}

// ============================================================================
// WALLET OPERATIONS
// ============================================================================

async function findById(id) {
  return wallets.get(id) || null;
}

async function findByUserAndCurrency(userId, currencyId) {
  for (const wallet of wallets.values()) {
    if (wallet.user_id === userId && wallet.currency_id === currencyId && !wallet.deleted_at) {
      return wallet;
    }
  }
  return null;
}

async function findAllByUser(userId) {
  const result = [];
  for (const wallet of wallets.values()) {
    if (wallet.user_id === userId && !wallet.deleted_at) {
      result.push(wallet);
    }
  }
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function create(data) {
  const {
    userId, currencyId,
    walletType = 'user',
    balance = 0,
    availableBalance = 0,
    frozenBalance = 0,
    status = 'active'
  } = data;

  const now = new Date().toISOString();
  const wallet = {
    id: generateId(),
    user_id: userId,
    currency_id: currencyId,
    wallet_type: walletType,
    balance,
    available_balance: availableBalance,
    frozen_balance: frozenBalance,
    status,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  wallets.set(wallet.id, wallet);
  return wallet;
}

async function updateBalances(id, availableBalance, frozenBalance) {
  const wallet = wallets.get(id);
  if (!wallet || wallet.deleted_at) return null;

  wallet.balance = availableBalance + frozenBalance;
  wallet.available_balance = availableBalance;
  wallet.frozen_balance = frozenBalance;
  wallet.updated_at = new Date().toISOString();
  return wallet;
}

async function creditAvailableBalance(id, amount) {
  const wallet = wallets.get(id);
  if (!wallet || wallet.deleted_at || wallet.status !== 'active') return null;

  wallet.available_balance += amount;
  wallet.balance += amount;
  wallet.updated_at = new Date().toISOString();
  return wallet;
}

async function debitAvailableBalance(id, amount) {
  const wallet = wallets.get(id);
  if (!wallet || wallet.deleted_at || wallet.status !== 'active') return null;
  if (wallet.available_balance < amount) return null;

  wallet.available_balance -= amount;
  wallet.balance -= amount;
  wallet.updated_at = new Date().toISOString();
  return wallet;
}

async function freezeAvailable(id, amount) {
  const wallet = wallets.get(id);
  if (!wallet || wallet.deleted_at || wallet.status !== 'active') return null;
  if (wallet.available_balance < amount) return null;

  wallet.available_balance -= amount;
  wallet.frozen_balance += amount;
  wallet.updated_at = new Date().toISOString();
  return wallet;
}

async function unfreezeFrozen(id, amount) {
  const wallet = wallets.get(id);
  if (!wallet || wallet.deleted_at || wallet.status !== 'active') return null;
  if (wallet.frozen_balance < amount) return null;

  wallet.frozen_balance -= amount;
  wallet.available_balance += amount;
  wallet.updated_at = new Date().toISOString();
  return wallet;
}

async function deductFrozen(id, amount) {
  const wallet = wallets.get(id);
  if (!wallet || wallet.deleted_at || wallet.status !== 'active') return null;
  if (wallet.frozen_balance < amount) return null;

  wallet.frozen_balance -= amount;
  wallet.balance -= amount;
  wallet.updated_at = new Date().toISOString();
  return wallet;
}

async function softDelete(id) {
  const wallet = wallets.get(id);
  if (!wallet) return null;
  wallet.deleted_at = new Date().toISOString();
  wallet.updated_at = wallet.deleted_at;
  return wallet;
}

async function getReconciliationSnapshot(walletId) {
  const wallet = wallets.get(walletId);
  if (!wallet) return null;
  return {
    wallet_id: wallet.id,
    user_id: wallet.user_id,
    currency_id: wallet.currency_id,
    balance: wallet.balance,
    available_balance: wallet.available_balance,
    frozen_balance: wallet.frozen_balance,
    status: wallet.status,
    transaction_count: Array.from(transactions.values()).filter(t => t.wallet_id === walletId).length,
    snapshot_time: new Date().toISOString(),
  };
}

// ============================================================================
// TRANSACTION OPERATIONS
// ============================================================================

async function findTransactionById(id) {
  return transactions.get(id) || null;
}

async function findByReferenceId(referenceId) {
  for (const tx of transactions.values()) {
    if (tx.reference_id === referenceId) return tx;
  }
  return null;
}

async function findByWalletId(walletId, options = {}) {
  const { limit = 20, offset = 0, type = null } = options;
  let result = Array.from(transactions.values()).filter(t => t.wallet_id === walletId);
  if (type) result = result.filter(t => t.type === type);
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return result.slice(offset, offset + limit);
}

async function findByUserId(userId, options = {}) {
  const { limit = 20, offset = 0, type = null } = options;
  let result = Array.from(transactions.values()).filter(t => t.user_id === userId);
  if (type) result = result.filter(t => t.type === type);
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return result.slice(offset, offset + limit);
}

async function countByUserId(userId, type = null) {
  let count = 0;
  for (const tx of transactions.values()) {
    if (tx.user_id === userId && (!type || tx.type === type)) count++;
  }
  return count;
}

async function createTransaction(data) {
  const {
    walletId, userId, tripId = null,
    amount, currencyId, type,
    description = '', status = 'success',
    referenceId = null
  } = data;

  const now = new Date().toISOString();
  const tx = {
    id: generateId(),
    wallet_id: walletId,
    trip_id: tripId,
    user_id: userId,
    amount,
    currency_id: currencyId,
    type,
    description,
    status,
    reference_id: referenceId,
    created_at: now,
  };

  transactions.set(tx.id, tx);
  return tx;
}

async function createLedgerEntry(data) {
  const {
    walletId, transactionId = null, creditAmount = 0, debitAmount = 0,
    currencyId, balanceBefore, balanceAfter,
    availableBefore, availableAfter, frozenBefore, frozenAfter,
    operationType, description = '', referenceId = null
  } = data;

  const entry = {
    id: generateId(),
    wallet_id: walletId,
    transaction_id: transactionId,
    credit_amount: creditAmount,
    debit_amount: debitAmount,
    currency_id: currencyId,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    available_before: availableBefore,
    available_after: availableAfter,
    frozen_before: frozenBefore,
    frozen_after: frozenAfter,
    operation_type: operationType,
    description,
    reference_id: referenceId,
    created_at: new Date().toISOString(),
  };

  ledgerEntries.push(entry);
  return entry;
}

// ============================================================================
// ESCROW OPERATIONS
// ============================================================================

async function findEscrowById(id) {
  return escrows.get(id) || null;
}

async function createEscrow(data) {
  const {
    tripId, payerId, payeeId = null,
    amount, currencyId, platformCommission = 0, netAmount,
    sourceWalletId, destinationWalletId = null,
    platformWalletId = null, description = ''
  } = data;

  const now = new Date().toISOString();
  const escrow = {
    id: generateId(),
    trip_id: tripId,
    payer_id: payerId,
    payee_id: payeeId,
    amount,
    currency_id: currencyId,
    platform_commission: platformCommission,
    net_amount: netAmount,
    source_wallet_id: sourceWalletId,
    destination_wallet_id: destinationWalletId,
    platform_wallet_id: platformWalletId,
    status: 'active',
    description,
    created_at: now,
    updated_at: now,
  };

  escrows.set(escrow.id, escrow);
  return escrow;
}

async function updateEscrowStatus(id, status, extraData = {}) {
  const escrow = escrows.get(id);
  if (!escrow) return null;
  escrow.status = status;
  escrow.updated_at = new Date().toISOString();
  Object.assign(escrow, extraData);
  return escrow;
}

// ============================================================================
// RESET (for testing)
// ============================================================================

function reset() {
  wallets.clear();
  transactions.clear();
  escrows.clear();
  ledgerEntries.length = 0;
}

module.exports = {
  // Wallet methods
  findById,
  findByUserAndCurrency,
  findAllByUser,
  create,
  updateBalances,
  creditAvailableBalance,
  debitAvailableBalance,
  freezeAvailable,
  unfreezeFrozen,
  deductFrozen,
  softDelete,
  getReconciliationSnapshot,
  // Transaction methods
  findTransactionById,
  findByReferenceId,
  findByWalletId,
  findByUserId,
  countByUserId,
  createTransaction,
  createLedgerEntry,
  // Escrow methods
  findEscrowById,
  createEscrow,
  updateEscrowStatus,
  // Utility
  reset,
};
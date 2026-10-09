/**
 * wallet.model.js - مدل کیف پول PostgreSQL
 * 
 * منطبق بر جدول `wallets` در PostgreSQL (Migration 001 + 004):
 *   - UUID Primary Key
 *   - available_balance و frozen_balance (جداسازی موجودی)
 *   - wallet_type (user, driver, platform, escrow)
 *   - Soft Delete از طریق deleted_at
 *   - constraint UNIQUE روی (user_id, currency_id)
 * 
 * این فایل یک Data Access Layer (DAL) ساده است
 * و از PostgreSQL Pool برای ارتباط استفاده می‌کند.
 */

const pg = require('../db/pg');

// ============================================================================
// نام جدول
// ============================================================================
const TABLE = 'wallets';
const COLUMNS = [
  'id', 'user_id', 'currency_id', 'wallet_type',
  'balance', 'available_balance', 'frozen_balance',
  'status', 'created_at', 'updated_at', 'deleted_at'
];
const COLUMNS_SELECT = COLUMNS.join(', ');

// ============================================================================
// متدهای مدل
// ============================================================================

/**
 * یافتن کیف پول با شناسه
 */
async function findById(id, client = null) {
  const queryText = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`;
  const params = [id];
  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * یافتن کیف پول کاربر بر اساس ارز
 */
async function findByUserAndCurrency(userId, currencyId, client = null) {
  const queryText = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} 
     WHERE user_id = $1 AND currency_id = $2 AND deleted_at IS NULL`;
  const params = [userId, currencyId];
  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * یافتن تمام کیف پول‌های یک کاربر
 */
async function findAllByUser(userId) {
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} 
     WHERE user_id = $1 AND deleted_at IS NULL 
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * ایجاد کیف پول جدید
 */
async function create(data, client = null) {
  const {
    userId, currencyId,
    walletType = 'user',
    balance = 0,
    availableBalance = 0,
    frozenBalance = 0,
    status = 'active'
  } = data;

  const queryText = `INSERT INTO ${TABLE} 
     (user_id, currency_id, wallet_type, balance, available_balance, frozen_balance, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS_SELECT}`;
  const params = [userId, currencyId, walletType, balance, availableBalance, frozenBalance, status];
  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  return result.rows[0];
}

/**
 * به‌روزرسانی موجودی کیف پول (atomic update)
 * 
 * این تابع در داخل تراکنش استفاده می‌شود.
 * client را به عنوان پارامتر می‌گیرد تا در تراکنش قابل استفاده باشد.
 */
async function updateBalances(id, availableBalance, frozenBalance, client = null) {
  const totalBalance = availableBalance + frozenBalance;
  const queryText = `
    UPDATE ${TABLE}
    SET balance = $1, available_balance = $2, frozen_balance = $3, updated_at = NOW()
    WHERE id = $4 AND deleted_at IS NULL
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [totalBalance, availableBalance, frozenBalance, id];

  if (client) {
    const result = await client.query(queryText, params);
    return result.rows[0] || null;
  }
  const result = await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * افزایش موجودی قابل استفاده (available_balance)
 */
async function creditAvailableBalance(id, amount, client = null) {
  if (client) {
    const result = await client.query(
      `UPDATE ${TABLE}
       SET available_balance = available_balance + $1,
           balance = balance + $1,
           updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL AND status = 'active'
       RETURNING ${COLUMNS_SELECT}`,
      [amount, id]
    );
    return result.rows[0] || null;
  }
  const result = await pg.query(
    `UPDATE ${TABLE}
     SET available_balance = available_balance + $1,
         balance = balance + $1,
         updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL AND status = 'active'
     RETURNING ${COLUMNS_SELECT}`,
    [amount, id]
  );
  return result.rows[0] || null;
}

/**
 * کاهش موجودی قابل استفاده (available_balance) با بررسی کافی بودن موجودی
 */
async function debitAvailableBalance(id, amount, client = null) {
  const queryText = `
    UPDATE ${TABLE}
    SET available_balance = available_balance - $1,
        balance = balance - $1,
        updated_at = NOW()
    WHERE id = $2 AND deleted_at IS NULL AND status = 'active'
      AND available_balance >= $1
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [amount, id];

  if (client) {
    const result = await client.query(queryText, params);
    return result.rows[0] || null;
  }
  const result = await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * انتقال از available به frozen (Freeze)
 */
async function freezeAvailable(id, amount, client = null) {
  const queryText = `
    UPDATE ${TABLE}
    SET available_balance = available_balance - $1,
        frozen_balance = frozen_balance + $1,
        updated_at = NOW()
    WHERE id = $2 AND deleted_at IS NULL AND status = 'active'
      AND available_balance >= $1
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [amount, id];

  if (client) {
    const result = await client.query(queryText, params);
    return result.rows[0] || null;
  }
  const result = await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * انتقال از frozen به available (Unfreeze/Release)
 */
async function unfreezeFrozen(id, amount, client = null) {
  const queryText = `
    UPDATE ${TABLE}
    SET frozen_balance = frozen_balance - $1,
        available_balance = available_balance + $1,
        updated_at = NOW()
    WHERE id = $2 AND deleted_at IS NULL AND status = 'active'
      AND frozen_balance >= $1
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [amount, id];

  if (client) {
    const result = await client.query(queryText, params);
    return result.rows[0] || null;
  }
  const result = await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * کسر از frozen (برای تسویه نهایی Escrow)
 */
async function deductFrozen(id, amount, client = null) {
  const queryText = `
    UPDATE ${TABLE}
    SET frozen_balance = frozen_balance - $1,
        balance = balance - $1,
        updated_at = NOW()
    WHERE id = $2 AND deleted_at IS NULL AND status = 'active'
      AND frozen_balance >= $1
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [amount, id];

  if (client) {
    const result = await client.query(queryText, params);
    return result.rows[0] || null;
  }
  const result = await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * کسر از موجودی قابل (اجازه منفی شدن = بدهی، برای تسویه سفر P5-1)
 * برخلاف `debitAvailableBalance`، گارد موجودی کافی ندارد:
 * اگر موجودی مسافر ناکافی باشد، حساب منفی میشود و به سیستم اعتباری ارجاع
 * داده میشود (Debt/Credit) و در تراکنش بهصورت status 'pending' ثبت میشود.
 */
async function debitAllowNegative(id, amount, client = null) {
  const queryText = `
    UPDATE ${TABLE}
    SET available_balance = available_balance - $1,
        balance = balance - $1,
        updated_at = NOW()
    WHERE id = $2 AND deleted_at IS NULL AND status = 'active'
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [amount, id];

  if (client) {
    const result = await client.query(queryText, params);
    return result.rows[0] || null;
  }
  const result = await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * Soft Delete کیف پول
 */
async function softDelete(id) {
  const result = await pg.query(
    `UPDATE ${TABLE} SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING ${COLUMNS_SELECT}`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * دریافت اطلاعات حساب برای مغایرت‌گیری (Reconciliation)
 */
async function getReconciliationSnapshot(walletId) {
  const result = await pg.query(
    `SELECT * FROM fn_get_wallet_snapshot($1)`,
    [walletId]
  );
  return result.rows[0] || null;
}

module.exports = {
  findById,
  findByUserAndCurrency,
  findAllByUser,
  create,
  updateBalances,
  creditAvailableBalance,
  debitAvailableBalance,
  debitAllowNegative,
  freezeAvailable,
  unfreezeFrozen,
  deductFrozen,
  softDelete,
  getReconciliationSnapshot,
};
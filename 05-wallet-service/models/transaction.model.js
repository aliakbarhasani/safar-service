/**
 * transaction.model.js - مدل تراکنش مالی PostgreSQL
 * 
 * منطبق بر جدول `transactions` در PostgreSQL (Migration 001):
 *   - UUID Primary Key
 *   - انواع تراکنش: CREDIT / DEBIT
 *   - وضعیت‌ها: pending, success, failed
 *   - reference_id برای Idempotency
 *   - ارجاع به wallet_id, trip_id, user_id
 */

const pg = require('../db/pg');

// ============================================================================
// نام جدول
// ============================================================================
const TABLE = 'transactions';
const COLUMNS = [
  'id', 'wallet_id', 'trip_id', 'user_id',
  'amount', 'currency_id', 'type',
  'description', 'status', 'reference_id',
  'created_at'
];
const COLUMNS_SELECT = COLUMNS.join(', ');

// ============================================================================
// متدهای مدل
// ============================================================================

/**
 * یافتن تراکنش با شناسه
 */
async function findById(id, client = null) {
  const queryText = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE id = $1`;
  const params = [id];
  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * یافتن تراکنش با reference_id (برای Idempotency)
 */
async function findByReferenceId(referenceId, client = null) {
  const queryText = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE reference_id = $1`;
  const params = [referenceId];
  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * دریافت تراکنش‌های یک کیف پول
 */
async function findByWalletId(walletId, options = {}) {
  const { limit = 20, offset = 0, type = null, sort = 'DESC' } = options;

  let queryText = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE wallet_id = $1`;
  const params = [walletId];

  if (type) {
    params.push(type);
    queryText += ` AND type = $${params.length}`;
  }

  queryText += ` ORDER BY created_at ${sort === 'ASC' ? 'ASC' : 'DESC'}`;
  params.push(limit);
  queryText += ` LIMIT $${params.length}`;
  params.push(offset);
  queryText += ` OFFSET $${params.length}`;

  const result = await pg.query(queryText, params);
  return result.rows;
}

/**
 * دریافت تراکنش‌های یک کاربر
 */
async function findByUserId(userId, options = {}) {
  const { limit = 20, offset = 0, type = null, sort = 'DESC', currencyId = null } = options;

  let queryText = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE user_id = $1`;
  const params = [userId];

  if (type) {
    params.push(type);
    queryText += ` AND type = $${params.length}`;
  }

  if (currencyId) {
    params.push(String(currencyId));
    queryText += ` AND currency_id IN (
      SELECT id FROM currencies WHERE code = ${params.length} OR id::text = $${params.length}
    )`;
  }

  queryText += ` ORDER BY created_at ${sort === 'ASC' ? 'ASC' : 'DESC'}`;
  params.push(limit);
  queryText += ` LIMIT $${params.length}`;
  params.push(offset);
  queryText += ` OFFSET $${params.length}`;

  const result = await pg.query(queryText, params);
  return result.rows;
}

/**
 * شمارش تعداد تراکنش‌های یک کاربر
 */
async function countByUserId(userId, type = null, currencyId = null) {
  let queryText = `SELECT COUNT(*) as total FROM ${TABLE} WHERE user_id = $1`;
  const params = [userId];

  if (type) {
    params.push(type);
    queryText += ` AND type = $${params.length}`;
  }

  if (currencyId) {
    params.push(String(currencyId));
    queryText += ` AND currency_id IN (
      SELECT id FROM currencies WHERE code = ${params.length} OR id::text = $${params.length}
    )`;
  }

  const result = await pg.query(queryText, params);
  return parseInt(result.rows[0].total, 10);
}

/**
 * ایجاد تراکنش جدید
 * این تابع در داخل تراکنش PostgreSQL استفاده می‌شود
 */
async function create(data, client = null) {
  const {
    walletId, userId, tripId = null,
    amount, currencyId, type,
    description = '', status = 'success',
    referenceId = null
  } = data;

  const queryText = `
    INSERT INTO ${TABLE}
    (wallet_id, trip_id, user_id, amount, currency_id, type, description, status, reference_id)
    SELECT $1, $2, $3, $4, c.id, $6, $7, $8, $9
    FROM currencies c
    WHERE c.code = $5 OR c.id::text = $5
    ORDER BY CASE WHEN c.code = $5 THEN 0 ELSE 1 END
    LIMIT 1
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [walletId, tripId, userId || null, amount, String(currencyId), type, description, status, referenceId];

  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  if (!result.rows[0]) {
    throw new Error(`Unknown currency code or ID: ${currencyId}`);
  }
  return result.rows[0];
}

/**
 * ثبت در دفتر کل (wallet_ledger)
 * این تابع در داخل تراکنش PostgreSQL استفاده می‌شود
 */
async function createLedgerEntry(data, client) {
  const {
    walletId, transactionId = null, creditAmount = 0, debitAmount = 0,
    currencyId, balanceBefore, balanceAfter,
    availableBefore, availableAfter, frozenBefore, frozenAfter,
    operationType, description = '', referenceId = null, createdBy = null
  } = data;

  const queryText = `
    INSERT INTO wallet_ledger
    (wallet_id, transaction_id, credit_amount, debit_amount,
     currency_id, balance_before, balance_after,
     available_before, available_after, frozen_before, frozen_after,
     operation_type, description, reference_id, created_by)
    SELECT $1, $2, $3, $4, c.id, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    FROM currencies c
    WHERE c.code = $5 OR c.id::text = $5
    ORDER BY CASE WHEN c.code = $5 THEN 0 ELSE 1 END
    LIMIT 1
    RETURNING *
  `;
  const params = [
    walletId, transactionId, creditAmount, debitAmount,
    String(currencyId), balanceBefore, balanceAfter,
    availableBefore, availableAfter, frozenBefore, frozenAfter,
    operationType, description, referenceId, createdBy
  ];

  const result = await client.query(queryText, params);
  if (!result.rows[0]) {
    throw new Error(`Unknown currency code or ID: ${currencyId}`);
  }
  return result;
}

module.exports = {
  findById,
  findByReferenceId,
  findByWalletId,
  findByUserId,
  countByUserId,
  create,
  createLedgerEntry,
};
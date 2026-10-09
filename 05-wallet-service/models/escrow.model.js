/**
 * escrow.model.js - مدل تراکنش‌های Escrow
 * 
 * منطبق بر جدول `escrow_transactions` در PostgreSQL (Migration 005):
 *   - UUID Primary Key
 *   - چرخه کامل ۷ مرحله‌ای: active → released/refunded/expired/disputed → resolved
 *   - ارجاع به trip, payer, payee, wallets
 *   - Soft Delete
 */

const pg = require('../db/pg');

const TABLE = 'escrow_transactions';
const COLUMNS = [
  'id', 'trip_id', 'payer_id', 'payee_id',
  'amount', 'currency_id', 'platform_commission', 'net_amount',
  'status',
  'source_wallet_id', 'destination_wallet_id', 'platform_wallet_id',
  'description',
  'released_at', 'refunded_at', 'expired_at',
  'disputed_at', 'resolved_at',
  'dispute_reason', 'resolution_notes', 'resolved_by',
  'created_at', 'updated_at', 'deleted_at'
];
const COLUMNS_SELECT = COLUMNS.join(', ');

/**
 * یافتن Escrow با شناسه
 */
async function findById(id, client = null, forUpdate = false) {
  const queryText = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL${client && forUpdate ? ' FOR UPDATE' : ''}`;
  const params = [id];
  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * یافتن Escrow بر اساس سفر
 */
async function findByTripId(tripId) {
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tripId]
  );
  return result.rows;
}

/**
 * یافتن Escrow بر اساس پرداخت‌کننده
 */
async function findByPayerId(payerId, status = null) {
  let query = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE payer_id = $1 AND deleted_at IS NULL`;
  const params = [payerId];

  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }

  query += ' ORDER BY created_at DESC';
  const result = await pg.query(query, params);
  return result.rows;
}

/**
 * یافتن Escrow بر اساس وضعیت
 */
async function findByStatus(status) {
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [status]
  );
  return result.rows;
}

/**
 * ایجاد Escrow جدید
 */
async function create(data, client = null) {
  const {
    tripId = null, payerId, payeeId = null,
    amount, currencyId, platformCommission = 0, netAmount,
    sourceWalletId, destinationWalletId = null, platformWalletId = null,
    description = ''
  } = data;

  const queryText = `
    INSERT INTO ${TABLE}
    (trip_id, payer_id, payee_id, amount, currency_id, platform_commission, net_amount,
     source_wallet_id, destination_wallet_id, platform_wallet_id, description)
    SELECT $1, $2, $3, $4, c.id, $6, $7, $8, $9, $10, $11
    FROM currencies c
    WHERE c.code = $5 OR c.id::text = $5
    ORDER BY CASE WHEN c.code = $5 THEN 0 ELSE 1 END
    LIMIT 1
    RETURNING ${COLUMNS_SELECT}
  `;
  const params = [
    tripId, payerId, payeeId, amount, String(currencyId), platformCommission, netAmount,
    sourceWalletId, destinationWalletId, platformWalletId, description
  ];

  const result = client
    ? await client.query(queryText, params)
    : await pg.query(queryText, params);
  if (!result.rows[0]) {
    throw new Error(`Unknown currency code or ID: ${currencyId}`);
  }
  return result.rows[0];
}

/**
 * به‌روزرسانی وضعیت Escrow
 */
async function updateStatus(id, status, extraFields = {}, client = null) {
  const setClauses = ['status = $2', 'updated_at = NOW()'];
  const params = [id, status];
  let paramIndex = 3;

  const timestampFields = {
    released: 'released_at',
    refunded: 'refunded_at',
    expired: 'expired_at',
    disputed: 'disputed_at',
    resolved: 'resolved_at'
  };

  if (timestampFields[status]) {
    setClauses.push(`${timestampFields[status]} = NOW()`);
  }

  for (const [key, value] of Object.entries(extraFields)) {
    if (value !== undefined && value !== null) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  const queryText = `
    UPDATE ${TABLE}
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING ${COLUMNS_SELECT}
  `;

  if (client) {
    const result = await client.query(queryText, params);
    return result.rows[0] || null;
  }
  const result = await pg.query(queryText, params);
  return result.rows[0] || null;
}

/**
 * شمارش Escrowهای فعال برای یک کاربر
 */
async function countActiveByUser(userId) {
  const result = await pg.query(
    `SELECT COUNT(*) as total FROM ${TABLE}
     WHERE (payer_id = $1 OR payee_id = $1)
       AND status = 'active'
       AND deleted_at IS NULL`,
    [userId]
  );
  return parseInt(result.rows[0].total, 10);
}

module.exports = {
  findById,
  findByTripId,
  findByPayerId,
  findByStatus,
  create,
  updateStatus,
  countActiveByUser,
};
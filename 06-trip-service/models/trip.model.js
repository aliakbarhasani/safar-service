/**
 * trip.model.js - مدل سفر PostgreSQL
 * 
 * منطبق بر جدول `trips` در PostgreSQL (Migration 001):
 *   - UUID Primary Key
 *   - 9-state status machine (ماشین وضعیت ۹ حالته)
 *   - Service types sourced from 01-core-system/constants/ServiceTypes.js (unified dictionary)
 *   - Multi-currency support
 *   - Soft Delete
 *   - Geo-coordinates for origin/destination
 * 
 * توجه: هیچ فرمول قیمت‌گذاری در این مدل وجود ندارد.
 * تمام قیمت‌ها توسط سرویس 15-pricing-engine محاسبه می‌شود.
 */

const pg = require('../db/pg');

const TABLE = 'trips';
const COLUMNS = [
  'id', 'passenger_id', 'driver_id',
  'origin_address', 'origin_latitude', 'origin_longitude',
  'destination_address', 'destination_latitude', 'destination_longitude',
  'status', 'trip_phase',
  'payment_method', 'estimated_cost', 'final_cost',
  'base_fare', 'commission_rate', 'commission_amount', 'driver_earning', 'currency_id',
  'service_type',
  'cancel_reason', 'cancelled_by',
  'passenger_boarded', 'security_report', 'emergency_flag', 'support_ticket_id',
  'country_id',
  'started_at', 'finished_at',
  'version',
  'created_at', 'updated_at', 'deleted_at'
];
const COLUMNS_SELECT = COLUMNS.join(', ');

async function findById(id) {
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] || null;
}

async function findByPassengerId(passengerId, options = {}) {
  const { limit = 20, offset = 0, status = null } = options;
  let query = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE passenger_id = $1 AND deleted_at IS NULL`;
  const params = [passengerId];
  if (status) { params.push(status); query += ` AND status = $${params.length}`; }
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  const result = await pg.query(query, params);
  return result.rows;
}

async function findByDriverId(driverId, options = {}) {
  const { limit = 20, offset = 0, status = null } = options;
  let query = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE driver_id = $1 AND deleted_at IS NULL`;
  const params = [driverId];
  if (status) { params.push(status); query += ` AND status = $${params.length}`; }
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  const result = await pg.query(query, params);
  return result.rows;
}

async function findByStatus(status, options = {}) {
  const { limit = 50, offset = 0 } = options;
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );
  return result.rows;
}

async function create(data, client = null) {
  const {
    passengerId, driverId,
    originAddress, originLatitude, originLongitude,
    destinationAddress, destinationLatitude, destinationLongitude,
    paymentMethod = 'wallet', estimatedCost = 0, finalCost = 0,
    baseFare = 0, commissionRate = 0, commissionAmount = 0, driverEarning = 0, currencyId,
    serviceType, countryId
  } = data;

  const q = `
    INSERT INTO ${TABLE}
    (passenger_id, driver_id, origin_address, origin_latitude, origin_longitude,
     destination_address, destination_latitude, destination_longitude,
     payment_method, estimated_cost, final_cost,
     base_fare, commission_rate, commission_amount, driver_earning, currency_id,
     service_type, country_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING ${COLUMNS_SELECT}`;
  const p = [passengerId, driverId || null,
    originAddress, originLatitude, originLongitude,
    destinationAddress, destinationLatitude, destinationLongitude,
    paymentMethod, estimatedCost, finalCost,
    baseFare, commissionRate, commissionAmount, driverEarning, currencyId || null,
    serviceType, countryId || null];

  if (client) { const r = await client.query(q, p); return r.rows[0]; }
  const r = await pg.query(q, p); return r.rows[0];
}

/**
 * به‌روزرسانی وضعیت سفر با Optimistic Concurrency Control
 * 
 * اگر _expectedVersion در extraFields باشد،
 * version چک می‌شود تا از تداخل همزمانی جلوگیری کند.
 * در صورت عدم تطابق version، result.rows خالی خواهد بود.
 */
async function updateStatus(id, newStatus, extraFields = {}, client = null) {
  const setClauses = ['status = $2', 'trip_phase = $2', 'version = version + 1', 'updated_at = NOW()'];
  const params = [id, newStatus];
  let paramIndex = 3;
  let expectedVersion = null;

  if (extraFields._expectedVersion !== undefined) {
    expectedVersion = extraFields._expectedVersion;
    delete extraFields._expectedVersion;
  }

  for (const [key, value] of Object.entries(extraFields)) {
    if (value !== undefined && value !== null) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  let whereClause = 'id = $1 AND deleted_at IS NULL';
  if (expectedVersion !== null) {
    params.push(expectedVersion);
    whereClause += ` AND version = $${paramIndex}`;
    paramIndex++;
  }

  const queryText = `UPDATE ${TABLE} SET ${setClauses.join(', ')} WHERE ${whereClause} RETURNING ${COLUMNS_SELECT}`;

  if (client) { const r = await client.query(queryText, params); return r.rows[0] || null; }
  const r = await pg.query(queryText, params); return r.rows[0] || null;
}

async function assignDriver(tripId, driverId, client = null) {
  const q = `UPDATE ${TABLE} SET driver_id = $2, status = 'accepted', trip_phase = 'accepted', version = version + 1, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL AND status = 'requested' RETURNING ${COLUMNS_SELECT}`;
  if (client) { const r = await client.query(q, [tripId, driverId]); return r.rows[0] || null; }
  const r = await pg.query(q, [tripId, driverId]); return r.rows[0] || null;
}

async function softDelete(id) {
  const r = await pg.query(`UPDATE ${TABLE} SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING ${COLUMNS_SELECT}`, [id]);
  return r.rows[0] || null;
}

async function countByStatus(status) {
  const r = await pg.query(`SELECT COUNT(*) as total FROM ${TABLE} WHERE status = $1 AND deleted_at IS NULL`, [status]);
  return parseInt(r.rows[0].total, 10);
}

async function findAll(options = {}) {
  const { limit = 50, offset = 0, status = null } = options;
  let query = `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE deleted_at IS NULL`;
  const params = [];
  if (status) { params.push(status); query += ` AND status = $${params.length}`; }
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  const r = await pg.query(query, params);
  return r.rows;
}

module.exports = {
  findById, findByPassengerId, findByDriverId, findByStatus, findAll,
  create, updateStatus, assignDriver, softDelete, countByStatus,
};
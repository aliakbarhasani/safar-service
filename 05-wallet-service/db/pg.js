/**
 * pg.js - PostgreSQL Connection Pool for Safar Service
 * 
 * این ماژول اتصال به PostgreSQL را از طریق Pool مدیریت می‌کند.
 * از یک Pool امن با تعداد مشخصی کانکشن همزمان استفاده می‌کند.
 */

const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

let pool = null;
let connected = false;

/**
 * ایجاد و پیکربندی Pool اتصال PostgreSQL
 */
function createPool() {
  if (pool) return pool;

  pool = new Pool({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    max: config.pg.max,
    idleTimeoutMillis: config.pg.idleTimeoutMillis,
    connectionTimeoutMillis: config.pg.connectionTimeoutMillis,
  });

  // Event handlers
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
  });

  pool.on('connect', () => {
    connected = true;
  });

  return pool;
}

/**
 * اتصال به PostgreSQL و بررسی سلامت
 */
async function connectPG() {
  try {
    const p = getPool();
    const client = await p.connect();
    const res = await client.query('SELECT NOW()');
    console.log('PostgreSQL connected:', res.rows[0].now);
    client.release();
    connected = true;
    return true;
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    connected = false;
    return false;
  }
}

/**
 * دریافت Pool (create if not exists)
 */
function getPool() {
  if (!pool) {
    return createPool();
  }
  return pool;
}

/**
 * اجرای یک کوئری با پارامتر
 */
async function query(text, params = []) {
  const p = getPool();
  const start = Date.now();
  const result = await p.query(text, params);
  const duration = Date.now() - start;
  console.log(`Query executed in ${duration}ms | rows: ${result.rowCount}`);
  return result;
}

/**
 * اجرای یک تراکنش با callback
 * خودکار BEGIN و COMMIT/ROLLBACK را مدیریت می‌کند
 * 
 * @param {Function} callback - (client) => Promise
 * @returns {*} نتیجه callback
 */
async function transaction(callback) {
  const p = getPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * بررسی وضعیت اتصال
 */
function isConnected() {
  return connected;
}

/**
 * بستن Pool
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    connected = false;
    console.log('PostgreSQL pool closed');
  }
}

module.exports = {
  connectPG,
  getPool,
  query,
  transaction,
  isConnected,
  closePool,
  createPool,
};
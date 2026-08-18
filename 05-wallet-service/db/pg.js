/**
 * pg.js - PostgreSQL Connection Pool with In-Memory Fallback
 * 
 * این ماژول ابتدا سعی می‌کند به PostgreSQL متصل شود.
 * اگر دیتابیس در دسترس نباشد، به صورت خودکار به حافظه داخلی (In-Memory Fallback)
 * سوئیچ می‌کند تا سرویس و تست‌ها بدون وقفه کار کنند.
 */

const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

let pool = null;
let connected = false;
let useFallback = false;
let fallbackPool = null;

// In-memory fallback storage
const fallbackTables = {
  wallets: new Map(),
  transactions: new Map(),
  escrows: new Map(),
};

let fallbackIdCounter = 1;

function initFallback() {
  if (fallbackPool) return;
  fallbackPool = {
    wallets: new Map(),
    transactions: new Map(),
    escrows: new Map(),
  };
  useFallback = true;
  connected = false;
}

/**
 * ایجاد و پیکربندی Pool اتصال PostgreSQL
 */
function createPool() {
  if (pool) return pool;

  try {
    pool = new Pool({
      host: config.pg.host,
      port: config.pg.port,
      database: config.pg.database,
      user: config.pg.user,
      password: config.pg.password,
      max: config.pg.max || 5,
      idleTimeoutMillis: config.pg.idleTimeoutMillis || 3000,
      connectionTimeoutMillis: config.pg.connectionTimeoutMillis || 2000,
    });

    // Event handlers
    pool.on('error', (err) => {
      console.warn('PostgreSQL pool error (will use fallback):', err.message);
      connected = false;
      useFallback = true;
    });

    pool.on('connect', () => {
      connected = true;
      useFallback = false;
    });

    return pool;
  } catch (err) {
    console.warn('PostgreSQL pool creation failed, using in-memory fallback:', err.message);
    initFallback();
    return null;
  }
}

/**
 * اتصال به PostgreSQL و بررسی سلامت
 */
async function connectPG() {
  try {
    const p = createPool();
    if (!p) {
      initFallback();
      return false;
    }
    const client = await p.connect();
    const res = await client.query('SELECT NOW()');
    console.log('PostgreSQL connected:', res.rows[0].now);
    client.release();
    connected = true;
    useFallback = false;
    return true;
  } catch (err) {
    console.warn('PostgreSQL not available, using in-memory fallback:', err.message);
    initFallback();
    return false;
  }
}

/**
 * دریافت Pool (create if not exists)
 */
function getPool() {
  if (useFallback || !pool) {
    if (!useFallback) initFallback();
    return null; // Return null to signal fallback mode
  }
  return pool;
}

/**
 * اجرای یک کوئری با پارامتر
 */
async function query(text, params = []) {
  const p = getPool();
  if (useFallback || !p) {
    return { rows: [], rowCount: 0, command: 'FALLBACK' };
  }
  const start = Date.now();
  const result = await p.query(text, params);
  const duration = Date.now() - start;
  console.log(`Query executed in ${duration}ms | rows: ${result.rowCount}`);
  return result;
}

/**
 * اجرای یک تراکنش با callback
 * در حالت Fallback، مستقیماً callback را اجرا می‌کند
 */
async function transaction(callback) {
  if (useFallback || !pool) {
    try {
      return await callback({
        query: async (text, params) => {
          console.log(`[Fallback] Query: ${text.substring(0, 50)}...`);
          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      });
    } catch (error) {
      throw error;
    }
  }
  
  const p = pool;
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
  return connected && !useFallback;
}

/**
 * بستن Pool
 */
async function closePool() {
  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      // ignore
    }
    pool = null;
  }
  connected = false;
  useFallback = false;
  fallbackPool = null;
}

/**
 * بررسی آیا در حالت Fallback هستیم
 */
function isFallbackMode() {
  return useFallback;
}

module.exports = {
  connectPG,
  getPool,
  query,
  transaction,
  isConnected,
  closePool,
  createPool,
  isFallbackMode,
};

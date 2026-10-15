/**
 * pg.js - PostgreSQL Connection Pool
 *
 * PostgreSQL منبع اصلی و قابل اعتماد داده‌های کیف پول است.
 * In-Memory Fallback فقط برای تست‌های صریح یا محیطی که عمداً فعال شده باشد مجاز است.
 */

const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

let pool = null;
let connected = false;
let useFallback = false;
let fallbackPool = null;

// In-memory fallback storage (test/explicit opt-in only)
const fallbackTables = {
  wallets: new Map(),
  transactions: new Map(),
  escrows: new Map(),
};

let fallbackIdCounter = 1;

function fallbackAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.SAFAR_ALLOW_IN_MEMORY_FALLBACK === 'true';
}

function initFallback() {
  if (!fallbackAllowed()) {
    throw new Error('PostgreSQL is required. In-memory wallet fallback is disabled. Set NODE_ENV=test or SAFAR_ALLOW_IN_MEMORY_FALLBACK=true only for controlled non-production use.');
  }
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

    pool.on('error', (err) => {
      console.warn('PostgreSQL pool error:', err.message);
      connected = false;
      if (fallbackAllowed()) {
        useFallback = true;
      }
    });

    pool.on('connect', () => {
      connected = true;
      useFallback = false;
    });

    return pool;
  } catch (err) {
    if (fallbackAllowed()) {
      console.warn('PostgreSQL pool creation failed, using explicit in-memory fallback:', err.message);
      initFallback();
      return null;
    }
    throw new Error(`PostgreSQL pool creation failed and fallback is disabled: ${err.message}`);
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
    if (fallbackAllowed()) {
      console.warn('PostgreSQL not available, using explicit in-memory fallback:', err.message);
      initFallback();
      return false;
    }
    console.error('PostgreSQL unavailable and wallet fallback is disabled:', err.message);
    return false;
  }
}

/**
 * دریافت Pool
 */
function getPool() {
  if (useFallback) {
    return null;
  }
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
  if (useFallback || !p) {
    if (!fallbackAllowed()) {
      throw new Error('PostgreSQL is unavailable and in-memory wallet fallback is disabled.');
    }
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
 */
async function transaction(callback) {
  if (useFallback || !pool) {
    if (!fallbackAllowed()) {
      throw new Error('PostgreSQL is required for wallet transactions. In-memory fallback is disabled.');
    }
    return callback({
      query: async (text) => {
        console.log(`[Fallback] Query: ${text.substring(0, 50)}...`);
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    });
  }

  const p = pool;
  const client = await p.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Preserve the operation failure as the primary error. A rollback
      // failure is important diagnostic context, but must not hide the cause.
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

function isConnected() {
  return connected && !useFallback;
}

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
  fallbackAllowed,
};

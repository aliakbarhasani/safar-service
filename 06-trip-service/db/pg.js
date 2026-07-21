/**
 * pg.js - PostgreSQL Connection Pool for Trip Service
 * 
 * Singleton pool shared across the Trip Engine module.
 * Uses the same pg connection as wallet-service for consistency.
 */

const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

let pool = null;
let connected = false;

function createPool() {
  if (pool) return pool;

  pool = new Pool({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    max: config.pg.max || 20,
    idleTimeoutMillis: config.pg.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: config.pg.connectionTimeoutMillis || 5000,
  });

  pool.on('error', (err) => console.error('PG Trip pool error:', err.message));
  pool.on('connect', () => { connected = true; });

  return pool;
}

function getPool() {
  if (!pool) return createPool();
  return pool;
}

async function query(text, params = []) {
  const p = getPool();
  const start = Date.now();
  const result = await p.query(text, params);
  return result;
}

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

function isConnected() {
  return connected;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    connected = false;
  }
}

module.exports = { getPool, query, transaction, isConnected, closePool, createPool };
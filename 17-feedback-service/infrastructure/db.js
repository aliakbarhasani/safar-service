/**
 * db.js - Feedback Service PostgreSQL Pool (Infrastructure)
 *
 * A tiny lazy singleton Pool so the reviews repository and use cases can run
 * against PostgreSQL without each module instantiating its own connection.
 */

const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

let pool = null;

/**
 * @returns {import('pg').Pool}
 */
function getPool() {
  if (!pool) {
    pool = new Pool(config.pg);
  }
  return pool;
}

/** Close the pool (useful for tests). */
async function closePool() {
  if (pool) {
    try { await pool.end(); } catch (_) { /* ignore */ }
    pool = null;
  }
}

module.exports = { getPool, closePool };
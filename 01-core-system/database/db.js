const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

const pool = new Pool({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  user: config.pg.user,
  password: config.pg.password,
  max: config.pg.max,
  idleTimeoutMillis: config.pg.idleTimeoutMillis,
  connectionTimeoutMillis: config.pg.connectionTimeoutMillis,
});

let connected = false;

async function connectDB() {
  const client = await pool.connect();
  connected = true;
  console.log('PostgreSQL connected');
  client.release();
}

function isDBConnected() {
  return connected;
}

function getPool() {
  return pool;
}

module.exports = { connectDB, isDBConnected, getPool };
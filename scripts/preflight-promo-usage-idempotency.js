'use strict';

// Read-only preflight for migration 033_promo_usage_trip_idempotency.sql.
// This script never changes data. It reports aggregate counts only and exits
// with code 2 when duplicate historical trip usage rows need manual review.
// Deliberately do not load .env: the operator must explicitly select the target DB.

const { Client } = require('pg');

async function runPreflight(client) {
  let transactionOpen = false;
  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;

    const tableResult = await client.query(
      "SELECT to_regclass('promo_usages') AS table_name"
    );
    if (!tableResult.rows[0] || !tableResult.rows[0].table_name) {
      const error = new Error(
        'promo_usages table was not found on the selected database; no migration readiness conclusion can be made.'
      );
      error.code = 'PROMO_USAGE_TABLE_MISSING';
      throw error;
    }

    const result = await client.query(`
      SELECT
        COUNT(*)::bigint AS duplicate_trip_ids,
        COALESCE(SUM(row_count - 1), 0)::bigint AS excess_rows
      FROM (
        SELECT trip_id, COUNT(*) AS row_count
        FROM promo_usages
        WHERE trip_id IS NOT NULL
        GROUP BY trip_id
        HAVING COUNT(*) > 1
      ) duplicates
    `);
    const duplicateTripIds = Number(result.rows[0].duplicate_trip_ids);
    const excessRows = Number(result.rows[0].excess_rows);

    await client.query('COMMIT');
    transactionOpen = false;

    return {
      ready: duplicateTripIds === 0,
      duplicateTripIds,
      excessRows,
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // Preserve the original read/preflight failure.
      }
    }
    throw error;
  }
}

async function main() {
  const required = ['PG_HOST', 'PG_DATABASE', 'PG_USER', 'PG_PASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(
      'Refusing to connect: set explicit target database credentials first. Missing: ' +
      missing.join(', ')
    );
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    connectionTimeoutMillis: 5000,
    application_name: 'safar-service-promo-usage-preflight',
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });

  try {
    await client.connect();
    const result = await runPreflight(client);
    console.log(
      JSON.stringify({
        check: 'promo_usage_trip_idempotency',
        ...result,
        recommendation: result.ready
          ? 'No duplicate trip IDs found. Continue with the normal reviewed migration process.'
          : 'STOP. Back up the database and manually reconcile duplicates before applying migration 033. No rows were changed.',
      }, null, 2)
    );
    if (!result.ready) process.exitCode = 2;
  } catch (error) {
    console.error(
      'Promo usage preflight failed safely: ' +
      (error.code || 'PREFLIGHT_ERROR') + ': ' + error.message
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  main();
}

module.exports = { runPreflight };

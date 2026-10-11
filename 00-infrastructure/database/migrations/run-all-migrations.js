/**
 * run-all-migrations.js - اجرای همه Migrationهای دیتابیس
 *
 * Usage: node run-all-migrations.js
 *
 * این اسکریپت تمام فایل‌های SQL را به ترتیب اجرا می‌کند
 * و وضعیت هر Migration را گزارش می‌دهد
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { Client } = require('pg');
const config = require('../../../14-config-system/server.config');

const MIGRATIONS_DIR = __dirname;

const MIGRATION_ORDER = [
  '001_initial_global_schema.sql',
  '002_extended_global_schema.sql',
  '003_auth_finance_support_schema.sql',
  '004_wallet_advanced_financials.sql',
  '005_financial_integrity_constraints.sql',
  '006_trip_engine_concurrency_and_timeline.sql',
  '007_auth_otp_tables.sql',
  '008_jwt_sessions.sql',
  '009_user_profiles_settings.sql',
  '010_rbac_tables.sql',
  '011_security_audit_tables.sql',
  '012_seller_advertiser_roles.sql',
  '013_pricing_configs.sql',
  '014_pricing_quotes_audit.sql',
  '015_quotes_audit_final.sql',
  '016_create_rides_tables.sql',
  'V1_0__create_pricing_tables.sql',
  '017_create_quotes_and_audit.sql',
  '018_cleanup_legacy_pricing.sql',
  '019_unify_roles_and_services.sql',
  '020_merge_ride_into_trip.sql',
  '022_create_driver_tables.sql',
  '023_create_driver_location_history.sql',
  '024_create_feedback_schema.sql',
  '025_create_audit_logs.sql',
  '026_create_promo_schema.sql',
  '027_create_outbox_table.sql',
  '028_create_inbox_table.sql',
  '029_add_soft_delete_columns.sql',
  '030_wallet_debt_support.sql',
  '031_wallet_currency_integrity.sql',
];

function findMissingMigrationFiles(migrationOrder, directory = MIGRATIONS_DIR, fileExists = fs.existsSync) {
  return migrationOrder.filter((filename) => !fileExists(path.join(directory, filename)));
}

const MIGRATION_LOCK_NAME = 'safar-service:schema-migrations:v1';

function calculateChecksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function validateMigrationLedger(migrationOrder, appliedRows, checksums) {
  const expected = new Set(migrationOrder);
  const applied = new Map();

  for (const row of appliedRows) {
    if (!expected.has(row.migration_id)) {
      const error = new Error(`Ledger contains unknown migration: ${row.migration_id}`);
      error.code = 'MIGRATION_LEDGER_UNKNOWN_ID';
      throw error;
    }
    const expectedChecksum = checksums.get(row.migration_id);
    if (row.checksum !== expectedChecksum) {
      const error = new Error(`Checksum mismatch for applied migration ${row.migration_id}; restore the exact migration file or review the database before continuing.`);
      error.code = 'MIGRATION_CHECKSUM_MISMATCH';
      error.migrationFile = row.migration_id;
      throw error;
    }
    applied.set(row.migration_id, row.checksum);
  }

  let pendingSeen = false;
  const pending = [];
  for (const migrationId of migrationOrder) {
    if (applied.has(migrationId)) {
      if (pendingSeen) {
        const error = new Error(`Migration ledger has a gap before already-applied migration ${migrationId}; manual review is required.`);
        error.code = 'MIGRATION_LEDGER_ORDER_GAP';
        throw error;
      }
    } else {
      pendingSeen = true;
      pending.push(migrationId);
    }
  }
  return pending;
}

async function ensureMigrationLedger(client) {
  const result = await client.query("SELECT to_regclass('public.schema_migrations') AS ledger");
  if (!result.rows[0].ledger) {
    const existing = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
    `);
    if (Number(existing.rows[0].count) > 0) {
      const error = new Error(
        'Database already contains application objects but has no public.schema_migrations ledger. Automatic baseline is unsafe; back up the database and follow the migration adoption procedure before retrying.'
      );
      error.code = 'MIGRATION_BASELINE_REQUIRED';
      throw error;
    }

    await client.query(`
      CREATE TABLE public.schema_migrations (
        migration_id TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}
/**
 * جدا کردن دستورات SQL با رعایت dollar-quoted strings و single quotes
 */
function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollar = false;
  let inQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (!inDollar && !inQuote && !inBlockComment && ch === '-' && next === '-') {
      inLineComment = true;
      while (i < sql.length && sql[i] !== '\n') i++;
      inLineComment = false;
      continue;
    }

    if (!inDollar && !inQuote && !inLineComment && ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/')) i++;
      i++;
      inBlockComment = false;
      continue;
    }

    if (inLineComment || inBlockComment) {
      current += ch;
      continue;
    }

    if (!inQuote && ch === '$') {
      const endIdx = sql.indexOf('$', i + 1);
      if (endIdx > i) {
        const tag = sql.substring(i + 1, endIdx);
        const closeTag = '$' + tag + '$';
        const closeIdx = sql.indexOf(closeTag, endIdx + 1);
        if (closeIdx > i) {
          current += sql.substring(i, closeIdx + closeTag.length);
          i = closeIdx + closeTag.length - 1;
          continue;
        }
      }
    }

    if (!inDollar && ch === "'") {
      inQuote = !inQuote;
      current += ch;
      continue;
    }

    if (!inDollar && !inQuote && ch === ';') {
      const trimmed = current.trim();
      const upper = trimmed.toUpperCase();
      if (trimmed && !trimmed.startsWith('--') && upper !== 'BEGIN' && upper !== 'COMMIT') {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed);
  return statements;
}

async function executeMigration(client, migrationFile, statements, logger = console, checksum = null) {
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    for (const statement of statements) {
      await client.query(statement);
    }
    if (checksum !== null) {
      await client.query(
        'INSERT INTO public.schema_migrations (migration_id, checksum) VALUES ($1, $2)',
        [migrationFile, checksum]
      );
    }
    await client.query('COMMIT');
    transactionStarted = false;
    logger.log(`  ✓ committed ${statements.length} statements`);
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        logger.error(`  ✗ rollback failed for ${migrationFile}: ${String(rollbackError.message || rollbackError).slice(0, 150)}`);
      }
    }
    error.migrationFile = migrationFile;
    throw error;
  }
}

async function runAllMigrations() {
  const missingFiles = findMissingMigrationFiles(MIGRATION_ORDER);
  if (missingFiles.length > 0) {
    const error = new Error(`Required migration file(s) missing: ${missingFiles.join(', ')}`);
    error.code = 'MIGRATION_FILES_MISSING';
    throw error;
  }

  const migrations = MIGRATION_ORDER.map((migrationFile) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFile), 'utf8');
    return {
      migrationFile,
      sql,
      statements: splitSQL(sql),
      checksum: calculateChecksum(sql),
    };
  });
  const checksums = new Map(migrations.map((migration) => [migration.migrationFile, migration.checksum]));

  const client = new Client({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  let lockAcquired = false;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);
    lockAcquired = true;
    await ensureMigrationLedger(client);

    const ledger = await client.query(
      'SELECT migration_id, checksum FROM public.schema_migrations ORDER BY applied_at, migration_id'
    );
    const pending = validateMigrationLedger(MIGRATION_ORDER, ledger.rows, checksums);
    const pendingSet = new Set(pending);

    console.log('==============================================');
    console.log('  SAFAR SERVICE - DATABASE MIGRATIONS');
    console.log('==============================================');
    console.log(`Database: ${config.pg.database}`);
    console.log(`Registered migrations: ${MIGRATION_ORDER.length}`);
    console.log(`Already applied: ${MIGRATION_ORDER.length - pending.length}`);
    console.log(`Pending: ${pending.length}`);
    console.log('----------------------------------------------');

    let completedThisRun = 0;
    for (const migration of migrations) {
      if (!pendingSet.has(migration.migrationFile)) {
        console.log(`✓ already applied: ${migration.migrationFile}`);
        continue;
      }

      console.log(`\n⏳ ${migration.migrationFile}...`);
      console.log(`  📄 ${migration.statements.length} statements`);
      try {
        await executeMigration(
          client,
          migration.migrationFile,
          migration.statements,
          console,
          migration.checksum
        );
        completedThisRun++;
      } catch (error) {
        console.error(`  ✗ migration failed and was rolled back [${error.code || 'NO_SQLSTATE'}]: ${String(error.message || error).slice(0, 200)}`);
        throw error;
      }
    }

    console.log('\n==============================================');
    console.log(`  Applied this run: ${completedThisRun}`);
    console.log('==============================================');
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME]);
      } catch (unlockError) {
        console.error(`Failed to release migration advisory lock: ${String(unlockError.message || unlockError).slice(0, 150)}`);
      }
    }
    await client.end();
  }
}

if (require.main === module) {
  runAllMigrations().catch((error) => {
    console.error(`Migration runner failed [${error.code || 'UNKNOWN'}]: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runAllMigrations,
  splitSQL,
  executeMigration,
  findMissingMigrationFiles,
  calculateChecksum,
  validateMigrationLedger,
  ensureMigrationLedger,
};
),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
}

/**
 * جدا کردن دستورات SQL با رعایت dollar-quoted strings و single quotes
 */
function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollar = false;
  let inQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (!inDollar && !inQuote && !inBlockComment && ch === '-' && next === '-') {
      inLineComment = true;
      while (i < sql.length && sql[i] !== '\n') i++;
      inLineComment = false;
      continue;
    }

    if (!inDollar && !inQuote && !inLineComment && ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/')) i++;
      i++;
      inBlockComment = false;
      continue;
    }

    if (inLineComment || inBlockComment) {
      current += ch;
      continue;
    }

    if (!inQuote && ch === '$') {
      const endIdx = sql.indexOf('$', i + 1);
      if (endIdx > i) {
        const tag = sql.substring(i + 1, endIdx);
        const closeTag = '$' + tag + '$';
        const closeIdx = sql.indexOf(closeTag, endIdx + 1);
        if (closeIdx > i) {
          current += sql.substring(i, closeIdx + closeTag.length);
          i = closeIdx + closeTag.length - 1;
          continue;
        }
      }
    }

    if (!inDollar && ch === "'") {
      inQuote = !inQuote;
      current += ch;
      continue;
    }

    if (!inDollar && !inQuote && ch === ';') {
      const trimmed = current.trim();
      const upper = trimmed.toUpperCase();
      if (trimmed && !trimmed.startsWith('--') && upper !== 'BEGIN' && upper !== 'COMMIT') {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed);
  return statements;
}

async function executeMigration(client, migrationFile, statements, logger = console) {
  await client.query('BEGIN');
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query('COMMIT');
    logger.log(`  ✓ committed ${statements.length} statements`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
      logger.error(`  ✗ rollback failed for ${migrationFile}: ${String(rollbackError.message || rollbackError).slice(0, 150)}`);
    }
    error.migrationFile = migrationFile;
    throw error;
  }
}

async function runAllMigrations() {
  // Never silently skip a required migration: that can leave a partial schema
  // while reporting success.
  const missingFiles = findMissingMigrationFiles(MIGRATION_ORDER);
  if (missingFiles.length > 0) {
    const error = new Error(`Required migration file(s) missing: ${missingFiles.join(', ')}`);
    error.code = 'MIGRATION_FILES_MISSING';
    throw error;
  }

  const client = new Client({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  try {
    console.log('==============================================');
    console.log('  SAFAR SERVICE - ALL DATABASE MIGRATIONS');
    console.log('==============================================');
    console.log(`Host: ${config.pg.host}:${config.pg.port}`);
    console.log(`Database: ${config.pg.database}`);
    console.log(`Total migrations: ${MIGRATION_ORDER.length}`);
    console.log('----------------------------------------------');

    let completedMigrations = 0;
    for (const migrationFile of MIGRATION_ORDER) {
      const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
      console.log(`\n⏳ ${migrationFile}...`);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      const statements = splitSQL(sql);
      console.log(`  📄 ${statements.length} statements`);
      try {
        await executeMigration(client, migrationFile, statements);
        completedMigrations++;
      } catch (error) {
        console.error(`  ✗ migration failed and was rolled back [${error.code || 'NO_SQLSTATE'}]: ${String(error.message || error).slice(0, 200)}`);
        throw error;
      }
    }

    console.log('\n==============================================');
    console.log(`  Completed: ${completedMigrations}/${MIGRATION_ORDER.length} migrations`);
    console.log('==============================================');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runAllMigrations().catch((error) => {
    console.error(`Migration runner failed [${error.code || 'UNKNOWN'}]: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runAllMigrations,
  splitSQL,
  executeMigration,
  findMissingMigrationFiles,
};

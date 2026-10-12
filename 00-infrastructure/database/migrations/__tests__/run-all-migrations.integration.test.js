'use strict';

const crypto = require('crypto');
const { Client } = require('pg');
const {
  executeMigration,
  calculateChecksum,
  validateMigrationLedger,
} = require('../run-all-migrations');

const enabled = process.env.MIGRATION_INTEGRATION_TESTS === '1';
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration('PostgreSQL migration transaction integration', () => {
  let client;
  let migrationId;
  let tableName;
  const logger = { log: jest.fn(), error: jest.fn() };

  beforeAll(async () => {
    client = new Client({
      host: process.env.PG_HOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || 5433),
      database: process.env.PG_DATABASE || 'safar_test_db',
      user: process.env.PG_USER || 'test_user',
      password: process.env.PG_PASSWORD || 'test_password',
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    const ledger = await client.query("SELECT to_regclass('public.schema_migrations') AS ledger");
    if (!ledger.rows[0].ledger) {
      throw new Error('schema_migrations must exist before the integration test runs');
    }
  });

  afterEach(async () => {
    if (client && migrationId) {
      await client.query('DELETE FROM public.schema_migrations WHERE migration_id = $1', [migrationId]);
    }
    if (client && tableName) {
      await client.query('DROP TABLE IF EXISTS pg_temp.' + tableName);
    }
    migrationId = null;
    tableName = null;
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(() => {
    const token = crypto.randomUUID().replace(/-/g, '');
    migrationId = '__integration_' + token + '.sql';
    tableName = 'migration_atomicity_' + token;
    logger.log.mockClear();
    logger.error.mockClear();
  });

  test('commits SQL and its checksum ledger row atomically, and recognizes the applied migration on retry', async () => {
    const sql = [
      'CREATE TEMP TABLE ' + tableName + ' (id INTEGER PRIMARY KEY)',
      'INSERT INTO ' + tableName + ' (id) VALUES (1)',
    ];
    const checksum = calculateChecksum(sql.join(';') + ';');

    await executeMigration(client, migrationId, sql, logger, checksum);

    const table = await client.query('SELECT id FROM ' + tableName);
    expect(table.rows).toEqual([{ id: 1 }]);

    const result = await client.query(
      'SELECT migration_id, checksum FROM public.schema_migrations WHERE migration_id = $1',
      [migrationId],
    );
    expect(result.rows).toEqual([{ migration_id: migrationId, checksum }]);
    expect(validateMigrationLedger([migrationId], result.rows, new Map([[migrationId, checksum]]))).toEqual([]);
  });

  test('rolls back PostgreSQL DDL and data and does not record a failed migration', async () => {
    const sql = [
      'CREATE TEMP TABLE ' + tableName + ' (id INTEGER PRIMARY KEY)',
      'INSERT INTO ' + tableName + ' (id) VALUES (1)',
      'INSERT INTO ' + tableName + ' (id) VALUES (1)',
    ];
    const checksum = calculateChecksum(sql.join(';') + ';');

    await expect(executeMigration(client, migrationId, sql, logger, checksum))
      .rejects.toMatchObject({ code: '23505', migrationFile: migrationId });

    const table = await client.query('SELECT to_regclass($1) AS relation', ['pg_temp.' + tableName]);
    expect(table.rows[0].relation).toBeNull();

    const ledger = await client.query(
      'SELECT migration_id FROM public.schema_migrations WHERE migration_id = $1',
      [migrationId],
    );
    expect(ledger.rows).toHaveLength(0);
  });
});

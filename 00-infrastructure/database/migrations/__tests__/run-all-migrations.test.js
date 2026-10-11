'use strict';

const {
  executeMigration,
  findMissingMigrationFiles,
  splitSQL,
  calculateChecksum,
  validateMigrationLedger,
  ensureMigrationLedger,
  MIGRATION_ORDER,
} = require('../run-all-migrations');

describe('atomic migration execution', () => {
  test('commits only after every statement succeeds', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const logger = { log: jest.fn(), error: jest.fn() };

    await executeMigration(client, '001.sql', ['CREATE TABLE sample(id int)', 'CREATE INDEX sample_id_idx ON sample(id)'], logger);

    expect(client.query.mock.calls).toEqual([
      ['BEGIN'],
      ['CREATE TABLE sample(id int)'],
      ['CREATE INDEX sample_id_idx ON sample(id)'],
      ['COMMIT'],
    ]);
  });

  test('writes the migration checksum in the same transaction before commit', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const logger = { log: jest.fn(), error: jest.fn() };
    const checksum = 'a'.repeat(64);

    await executeMigration(client, '001.sql', ['CREATE TABLE sample(id int)'], logger, checksum);

    expect(client.query.mock.calls).toEqual([
      ['BEGIN'],
      ['CREATE TABLE sample(id int)'],
      ['INSERT INTO public.schema_migrations (migration_id, checksum) VALUES ($1, $2)', ['001.sql', checksum]],
      ['COMMIT'],
    ]);
  });

  test('rolls back the whole migration on a data conflict and propagates the error', async () => {
    const conflict = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    const client = {
      query: jest.fn(async (sql) => {
        if (sql === 'INSERT INTO sample VALUES (1)') throw conflict;
        return { rows: [] };
      }),
    };
    const logger = { log: jest.fn(), error: jest.fn() };

    await expect(executeMigration(client, '002.sql', ['CREATE TABLE sample(id int)', 'INSERT INTO sample VALUES (1)'], logger))
      .rejects.toMatchObject({ code: '23505', migrationFile: '002.sql' });

    expect(client.query.mock.calls).toEqual([
      ['BEGIN'],
      ['CREATE TABLE sample(id int)'],
      ['INSERT INTO sample VALUES (1)'],
      ['ROLLBACK'],
    ]);
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
  });

  test('keeps the original SQL failure if rollback also fails', async () => {
    const original = Object.assign(new Error('schema drift'), { code: '42701' });
    const rollback = new Error('connection lost during rollback');
    const client = {
      query: jest.fn(async (sql) => {
        if (sql === 'ALTER TABLE sample ADD COLUMN id int') throw original;
        if (sql === 'ROLLBACK') throw rollback;
        return { rows: [] };
      }),
    };
    const logger = { log: jest.fn(), error: jest.fn() };

    await expect(executeMigration(client, '003.sql', ['ALTER TABLE sample ADD COLUMN id int'], logger))
      .rejects.toMatchObject({ code: '42701', migrationFile: '003.sql', rollbackError: rollback });
  });
});

describe('SQL statement splitting', () => {
  test('keeps semicolons inside dollar-quoted procedural blocks', () => {
    const sql = "DO $$ BEGIN PERFORM ';'; PERFORM 2; END; $$; SELECT 3;";
    expect(splitSQL(sql)).toEqual(["DO $$ BEGIN PERFORM ';'; PERFORM 2; END; $$", 'SELECT 3']);
  });

  test('rejects an unterminated dollar-quoted body', () => {
    expectErrorCode(() => splitSQL('DO $$ BEGIN PERFORM 1;'), 'MIGRATION_SQL_PARSE_ERROR');
  });

  test('rejects unterminated single-quoted strings and quoted identifiers', () => {
    expectErrorCode(() => splitSQL("SELECT 'unfinished"), 'MIGRATION_SQL_PARSE_ERROR');
    expectErrorCode(() => splitSQL('SELECT "unfinished'), 'MIGRATION_SQL_PARSE_ERROR');
  });

  test('keeps semicolons inside single-quoted strings', () => {
    expect(splitSQL("SELECT 'a;b'; SELECT 2;")).toEqual(["SELECT 'a;b'", 'SELECT 2']);
  });

  test('keeps semicolons inside strings with escaped single quotes', () => {
    expect(splitSQL("SELECT 'can''t;split'; SELECT 2;"))
      .toEqual(["SELECT 'can''t;split'", 'SELECT 2']);
  });

  test('keeps semicolons inside quoted identifiers', () => {
    expect(splitSQL('SELECT "odd;name" FROM sample; SELECT 2;'))
      .toEqual(['SELECT "odd;name" FROM sample', 'SELECT 2']);
  });

  test('supports nested PostgreSQL block comments without splitting statements', () => {
    const sql = 'SELECT 1 /* outer ; /* nested ; */ still outer ; */; SELECT 2;';
    expect(splitSQL(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  test('rejects unterminated PostgreSQL block comments', () => {
    expectErrorCode(() => splitSQL('SELECT 1 /* comment never closes'), 'MIGRATION_SQL_PARSE_ERROR');
  });
});

describe('migration manifest integrity', () => {
  test('registers the promo-code schema migration after the existing ordered history', () => {
    expect(MIGRATION_ORDER[MIGRATION_ORDER.length - 1]).toBe('032_add_trip_promo_code.sql');
  });

  test('contains no duplicate migration filenames', () => {
    expect(new Set(MIGRATION_ORDER).size).toBe(MIGRATION_ORDER.length);
  });
});

describe('required migration file validation', () => {
  test('returns an empty list when every required migration exists', () => {
    const fileExists = jest.fn().mockReturnValue(true);
    expect(findMissingMigrationFiles(['001.sql', '002.sql'], '/migrations', fileExists)).toEqual([]);
    expect(fileExists).toHaveBeenCalledTimes(2);
  });

  test('reports every missing migration rather than silently skipping it', () => {
    const fileExists = jest.fn((filePath) => filePath.endsWith('001.sql'));
    expect(findMissingMigrationFiles(['001.sql', '002.sql', '003.sql'], '/migrations', fileExists))
      .toEqual(['002.sql', '003.sql']);
  });
});

function expectErrorCode(callback, expectedCode) {
  try {
    callback();
  } catch (error) {
    expect(error.code).toBe(expectedCode);
    return;
  }
  throw new Error(`Expected ${expectedCode} to be thrown`);
}

describe('migration ledger validation', () => {
  const ids = ['001.sql', '002.sql', '003.sql'];
  const checksums = new Map(ids.map((id) => [id, calculateChecksum(id)]));

  test('returns only unapplied migrations in order', () => {
    expect(validateMigrationLedger(ids, [
      { migration_id: '001.sql', checksum: checksums.get('001.sql') },
      { migration_id: '002.sql', checksum: checksums.get('002.sql') },
    ], checksums)).toEqual(['003.sql']);
  });

  test('fails closed when an applied migration checksum changes', () => {
    expectErrorCode(() => validateMigrationLedger(ids, [
      { migration_id: '001.sql', checksum: '0'.repeat(64) },
    ], checksums), 'MIGRATION_CHECKSUM_MISMATCH');
  });

  test('fails if the ledger references a migration removed from the runner order', () => {
    expectErrorCode(() => validateMigrationLedger(ids, [
      { migration_id: '004.sql', checksum: '0'.repeat(64) },
    ], checksums), 'MIGRATION_LEDGER_UNKNOWN_ID');
  });

  test('fails if a later migration is marked applied while an earlier one is missing', () => {
    expectErrorCode(() => validateMigrationLedger(ids, [
      { migration_id: '001.sql', checksum: checksums.get('001.sql') },
      { migration_id: '003.sql', checksum: checksums.get('003.sql') },
    ], checksums), 'MIGRATION_LEDGER_ORDER_GAP');
  });
});

describe('safe adoption of existing databases', () => {
  test('refuses to create an empty ledger over an existing schema', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ ledger: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] }),
    };

    await expect(ensureMigrationLedger(client))
      .rejects.toMatchObject({ code: 'MIGRATION_BASELINE_REQUIRED' });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  test('creates the ledger for a fresh database', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ ledger: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await ensureMigrationLedger(client);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[2][0]).toContain('CREATE TABLE public.schema_migrations');
  });
});

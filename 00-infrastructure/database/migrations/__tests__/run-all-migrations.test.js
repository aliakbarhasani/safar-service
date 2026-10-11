'use strict';

const {
  executeMigration,
  findMissingMigrationFiles,
  splitSQL,
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
    const sql = "DO $$ BEGIN PERFORM ';'; PERFORM 2; END $$; SELECT 3;";
    expect(splitSQL(sql)).toEqual(["DO $$ BEGIN PERFORM ';'; PERFORM 2; END $$", 'SELECT 3']);
  });

  test('keeps semicolons inside single-quoted strings', () => {
    expect(splitSQL("SELECT 'a;b'; SELECT 2;")).toEqual(["SELECT 'a;b'", 'SELECT 2']);
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

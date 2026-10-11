'use strict';

const { isIdempotentMigrationError } = require('../run-all-migrations');

describe('migration error classification', () => {
  test.each(['42710', '42P07', '42P04', '42701'])('ignores only known idempotent DDL SQLSTATE %s', (code) => {
    expect(isIdempotentMigrationError({ code, message: 'object exists' })).toBe(true);
  });

  test('does not ignore unique violations even when the message contains duplicate', () => {
    expect(isIdempotentMigrationError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
  });

  test('does not ignore an arbitrary error merely because the message says already exists', () => {
    expect(isIdempotentMigrationError({ code: 'XX000', message: 'relation already exists in application state' })).toBe(false);
  });

  test('fails closed for missing or unknown SQLSTATE values', () => {
    expect(isIdempotentMigrationError(new Error('already exists'))).toBe(false);
    expect(isIdempotentMigrationError(null)).toBe(false);
  });
});

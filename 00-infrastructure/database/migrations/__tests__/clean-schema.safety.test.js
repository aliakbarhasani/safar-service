'use strict';

const { assertSchemaResetAllowed } = require('../clean-schema');

describe('destructive schema reset safety guard', () => {
  const targetDatabase = 'safar_test_db';
  const approvedEnv = {
    NODE_ENV: 'test',
    ALLOW_SCHEMA_RESET: 'true',
    CONFIRM_DATABASE_NAME: targetDatabase,
  };

  test('allows only an explicitly confirmed test database', () => {
    expect(() => assertSchemaResetAllowed(approvedEnv, targetDatabase)).not.toThrow();
  });

  test.each([undefined, 'production', 'staging', ''])(
    'rejects unsafe or unspecified NODE_ENV: %s',
    (nodeEnv) => {
      expect(() => assertSchemaResetAllowed({
        ...approvedEnv,
        NODE_ENV: nodeEnv,
      }, targetDatabase)).toThrow('NODE_ENV must be explicitly set to development or test');
    }
  );

  test('requires explicit destructive-action confirmation', () => {
    expect(() => assertSchemaResetAllowed({
      ...approvedEnv,
      ALLOW_SCHEMA_RESET: 'false',
    }, targetDatabase)).toThrow('ALLOW_SCHEMA_RESET=true');
  });

  test('requires exact target database name confirmation', () => {
    expect(() => assertSchemaResetAllowed({
      ...approvedEnv,
      CONFIRM_DATABASE_NAME: 'safar_prod',
    }, targetDatabase)).toThrow('must exactly match');
  });

  test('does not accept an empty target database confirmation', () => {
    expect(() => assertSchemaResetAllowed({
      ...approvedEnv,
      CONFIRM_DATABASE_NAME: '',
    }, targetDatabase)).toThrow('must exactly match');
  });
});

'use strict';

let mockClient;
let mockPool;

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

jest.mock('../../14-config-system/server.config', () => ({
  pg: {
    host: 'localhost',
    port: 5432,
    database: 'safar_test',
    user: 'test',
    password: 'test',
    max: 2,
  },
}));

describe('wallet PostgreSQL transaction error handling', () => {
  let pg;

  beforeEach(() => {
    jest.resetModules();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      on: jest.fn(),
      query: jest.fn(),
      end: jest.fn(),
    };
    pg = require('../db/pg');
    pg.createPool();
  });

  test('preserves the original operation error when rollback also fails', async () => {
    const operationError = new Error('wallet update failed');
    const rollbackError = new Error('connection lost during rollback');
    mockClient.query.mockImplementation(async (sql) => {
      if (sql === 'ROLLBACK') throw rollbackError;
      return { rows: [] };
    });

    await expect(pg.transaction(async () => {
      throw operationError;
    })).rejects.toBe(operationError);

    expect(operationError.rollbackError).toBe(rollbackError);
    expect(mockClient.query.mock.calls).toEqual([['BEGIN'], ['ROLLBACK']]);
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back and preserves an operation error when rollback succeeds', async () => {
    const operationError = new Error('wallet update failed');
    mockClient.query.mockResolvedValue({ rows: [] });

    await expect(pg.transaction(async () => {
      throw operationError;
    })).rejects.toBe(operationError);

    expect(operationError.rollbackError).toBeUndefined();
    expect(mockClient.query.mock.calls).toEqual([['BEGIN'], ['ROLLBACK']]);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

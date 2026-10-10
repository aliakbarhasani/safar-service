'use strict';

const { OutboxRepository, OUTBOX_STATUS } = require('../OutboxRepository');

describe('OutboxRepository.fetchPending', () => {
  test('recovers expired claims and atomically claims pending events', async () => {
    const rows = [{ id: 'event-1', status: OUTBOX_STATUS.PROCESSING }];
    const pool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows, rowCount: 1 }),
    };
    const repository = new OutboxRepository({ pool });

    await expect(repository.fetchPending({ limit: 10 })).resolves.toEqual(rows);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain("INTERVAL '5 minutes'");
    expect(pool.query.mock.calls[0][1]).toEqual([
      OUTBOX_STATUS.PENDING,
      OUTBOX_STATUS.PROCESSING,
    ]);
    expect(pool.query.mock.calls[1][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(pool.query.mock.calls[1][0]).toContain('SET status = $3');
    expect(pool.query.mock.calls[1][1]).toEqual([
      OUTBOX_STATUS.PENDING,
      10,
      OUTBOX_STATUS.PROCESSING,
    ]);
  });

  test('rejects invalid batch size before querying the database', async () => {
    const pool = { query: jest.fn() };
    const repository = new OutboxRepository({ pool });

    await expect(repository.fetchPending({ limit: 0 })).rejects.toMatchObject({
      code: 'OUTBOX_FETCH_VALIDATION',
    });
    expect(pool.query).not.toHaveBeenCalled();
  });
});

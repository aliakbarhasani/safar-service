'use strict';

/**
 * OutboxInbox.test.js - Core System (P12)
 *
 * تست‌های واحد الگوهای Transactional Outbox و Idempotent Inbox:
 *   - OutboxRepository: درج در تراکنش، واکشی PENDING، نشانه‌گذاری، backoff
 *   - InboxRepository : ادعای اتمیک (ON CONFLICT DO NOTHING) و compensate
 *   - OutboxRelay     : انتشار روی EventBus + eventId/aggregateId + شکست
 *   - IdempotentHandler: رد تکراری‌ها و rollback ادعا در خطای هندلر
 */

const { OutboxRepository, OUTBOX_STATUS } = require('../../../00-infrastructure/events/OutboxRepository');
const { InboxRepository } = require('../../../00-infrastructure/events/InboxRepository');
const OutboxRelay = require('../../OutboxRelay');
const IdempotentHandler = require('../../IdempotentHandler');

function makePool(impl) {
  return { query: jest.fn(impl) };
}

function makeOutboxRepo(overrides = {}) {
  return Object.assign({
    fetchPending: jest.fn().mockResolvedValue([]),
    markPublished: jest.fn().mockResolvedValue({ id: 'o1', status: 'PUBLISHED' }),
    markFailed: jest.fn().mockResolvedValue({ id: 'o1', status: 'PENDING' }),
  }, overrides);
}

describe('P12: OutboxRepository', () => {
  test('insert writes event with aggregateId/eventType/payload as PENDING', async () => {
    const inserted = { id: 'o1', aggregate_id: 't1', event_type: 'TripAccepted', status: 'PENDING' };
    const pool = makePool(async () => ({ rows: [inserted], rowCount: 1 }));
    const repo = new OutboxRepository({ pool });

    const row = await repo.insert({ aggregateId: 't1', eventType: 'TripAccepted', payload: { driverId: 'd1' } });

    expect(row).toEqual(inserted);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO outbox_events/);
    expect(params).toEqual(['t1', 'TripAccepted', JSON.stringify({ driverId: 'd1' }), OUTBOX_STATUS.PENDING]);
  });

  test('insert uses the transaction client when provided (same tx as domain change)', async () => {
    const pool = makePool(async () => ({ rows: [], rowCount: 0 }));
    const client = { query: jest.fn(async () => ({ rows: [{ id: 'o2' }], rowCount: 1 })) };
    const repo = new OutboxRepository({ pool });

    await repo.insert({ aggregateId: 't2', eventType: 'TripCancelled' }, client);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('insert rejects missing aggregateId/eventType', async () => {
    const repo = new OutboxRepository({ pool: makePool(async () => ({ rows: [] })) });
    await expect(repo.insert({ eventType: 'X' })).rejects.toThrow(/aggregateId/);
    await expect(repo.insert({ aggregateId: 'a' })).rejects.toThrow(/eventType/);
    expect(() => new OutboxRepository({})).toThrow(/requires a pg pool/);
  });

  test('fetchPending only selects PENDING rows ready for publishing', async () => {
    const rows = [{ id: 'o1', event_type: 'TripAccepted', aggregate_id: 't1', payload: {} }];
    const pool = makePool(async () => ({ rows, rowCount: rows.length }));
    const repo = new OutboxRepository({ pool });

    const out = await repo.fetchPending({ limit: 10 });

    expect(out).toEqual(rows);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE status = \$1 AND available_at <= NOW\(\)/);
    expect(params).toEqual([OUTBOX_STATUS.PENDING, 10]);
  });

  test('markPublished/markFailed/prunePublished emit the expected statements', async () => {
    const pool = makePool(async (sql) => {
      if (/UPDATE/.test(sql)) return { rows: [{ id: 'o1' }], rowCount: 1 };
      return { rows: [], rowCount: 3 };
    });
    const repo = new OutboxRepository({ pool });

    expect((await repo.markPublished('o1')).id).toBe('o1');
    await repo.markFailed('o1', new Error('bus down'), { maxRetries: 4 });
    expect(await repo.prunePublished({ olderThanHours: 48 })).toBe(3);

    const failedCall = pool.query.mock.calls[1];
    expect(failedCall[0]).toMatch(/retry_count = retry_count \+ 1/);
    expect(failedCall[1]).toContain('bus down');
    expect(failedCall[1]).toContain(OUTBOX_STATUS.FAILED);
  });
});

describe('P12: InboxRepository', () => {
  test('markProcessed returns true on first delivery and false when duplicate', async () => {
    const pool = makePool(async () => ({ rows: [{ handler_name: 'h', event_id: 'e1' }], rowCount: 1 }));
    const repo = new InboxRepository({ pool });

    expect(await repo.markProcessed({ handlerName: 'h', eventId: 'e1', eventType: 'TripAccepted' })).toBe(true);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(handler_name, event_id\) DO NOTHING/);
    expect(params.slice(0, 2)).toEqual(['h', 'e1']);

    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await repo.markProcessed({ handlerName: 'h', eventId: 'e1' })).toBe(false);
  });

  test('isProcessed and removeClaim reflect the inbox state', async () => {
    const pool = makePool(async () => ({ rows: [{ 1: 1 }], rowCount: 1 }));
    const repo = new InboxRepository({ pool });

    expect(await repo.isProcessed({ handlerName: 'h', eventId: 'e1' })).toBe(true);

    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await repo.removeClaim({ handlerName: 'h', eventId: 'e1' })).toBe(true);

    expect(() => new InboxRepository({})).toThrow(/requires a pg pool/);
  });
});

describe('P12: OutboxRelay', () => {
  const pendingRow = {
    id: 'evt-1',
    aggregate_id: 'trip-1',
    event_type: 'TripAccepted',
    payload: { driverId: 'drv-1' },
  };

  test('runOnce publishes events on the bus and marks them PUBLISHED', async () => {
    const repo = makeOutboxRepo({ fetchPending: jest.fn().mockResolvedValue([pendingRow]) });
    const published = [];
    const eventBus = { publish: (event, data) => published.push({ event, data }) };
    const relay = new OutboxRelay({ outboxRepository: repo, eventBus, logger: { error: () => {}, warn: () => {} } });

    const count = await relay.runOnce();

    expect(count).toBe(1);
    expect(published).toEqual([{
      event: 'TripAccepted',
      data: { driverId: 'drv-1', eventId: 'evt-1', aggregateId: 'trip-1' },
    }]);
    expect(repo.markPublished).toHaveBeenCalledWith('evt-1');
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  test('runOnce parks the record via markFailed when publishing throws', async () => {
    const repo = makeOutboxRepo({ fetchPending: jest.fn().mockResolvedValue([pendingRow]) });
    const eventBus = { publish: () => { throw new Error('bus down'); } };
    const errors = [];
    const relay = new OutboxRelay({
      outboxRepository: repo,
      eventBus,
      maxRetries: 3,
      logger: { error: (...a) => errors.push(a.join(' ')), warn: () => {} },
    });

    const count = await relay.runOnce();

    expect(count).toBe(0);
    expect(repo.markPublished).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalledWith('evt-1', expect.any(Error), { maxRetries: 3 });
    expect(errors.join(' ')).toMatch(/publish failed/);
  });

  test('start schedules ticks and stop clears the timer (unref-safe)', async () => {
    const repo = makeOutboxRepo();
    const relay = new OutboxRelay({ outboxRepository: repo, eventBus: { publish: () => {} }, intervalMs: 1000 });

    relay.start();
    expect(relay._timer).not.toBeNull();
    relay.start(); // idempotent
    relay.stop();
    expect(relay._timer).toBeNull();

    expect(() => new OutboxRelay({})).toThrow(/requires an outboxRepository/);
  });
});

describe('P12: IdempotentHandler', () => {
  function makeInbox(claimed = true) {
    return {
      markProcessed: jest.fn().mockResolvedValue(claimed),
      removeClaim: jest.fn().mockResolvedValue(true),
    };
  }

  test('first delivery runs the handler; duplicate is skipped', async () => {
    const inbox = makeInbox(true);
    const handler = jest.fn().mockResolvedValue('ok');
    const wrapped = new IdempotentHandler({
      handlerName: 'promo.trip-completed',
      handler,
      inboxRepository: inbox,
      logger: { warn: () => {}, error: () => {} },
    });

    const first = await wrapped.handle({ event: 'TripAccepted', data: { eventId: 'e1', tripId: 't1' } });
    expect(first).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(inbox.markProcessed).toHaveBeenCalledWith({
      handlerName: 'promo.trip-completed',
      eventId: 'e1',
      eventType: 'TripAccepted',
      payload: { eventId: 'e1', tripId: 't1' },
    });

    inbox.markProcessed.mockResolvedValueOnce(false);
    const second = await wrapped.handle({ event: 'TripAccepted', data: { eventId: 'e1', tripId: 't1' } });
    expect(second).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('falls back to a deterministic event id when eventId is absent', async () => {
    const inbox = makeInbox(true);
    const wrapped = new IdempotentHandler({
      handlerName: 'h',
      handler: jest.fn(),
      inboxRepository: inbox,
      logger: { warn: () => {}, error: () => {} },
    });

    await wrapped.handle({ event: 'TripCreated', data: { tripId: 't1', passengerId: 'p1' } });

    expect(inbox.markProcessed.mock.calls[0][0].eventId).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('rolls back the inbox claim and rethrows when the handler fails', async () => {
    const inbox = makeInbox(true);
    const handler = jest.fn().mockRejectedValue(new Error('handler exploded'));
    const wrapped = new IdempotentHandler({
      handlerName: 'h',
      handler,
      inboxRepository: inbox,
      logger: { warn: () => {}, error: () => {} },
    });

    await expect(wrapped.handle({ event: 'E', data: { eventId: 'e9' } })).rejects.toThrow('handler exploded');
    expect(inbox.removeClaim).toHaveBeenCalledWith({ handlerName: 'h', eventId: 'e9' });
  });

  test('subscribe() registers the wrapped handler on the bus', async () => {
    const inbox = makeInbox(true);
    const registered = {};
    const eventBus = { subscribe: (event, fn) => { registered[event] = fn; } };
    const handler = jest.fn().mockResolvedValue(undefined);

    const wrapped = new IdempotentHandler({
      handlerName: 'audit.trip',
      handler,
      inboxRepository: inbox,
      logger: { warn: () => {}, error: () => {} },
    }).subscribe(eventBus, 'TripAccepted');

    expect(typeof registered.TripAccepted).toBe('function');
    await registered.TripAccepted({ event: 'TripAccepted', data: { eventId: 'e1' } });
    expect(wrapped).toBe(registered.TripAccepted);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('constructor validates its dependencies', () => {
    expect(() => new IdempotentHandler({})).toThrow(/handlerName/);
    expect(() => new IdempotentHandler({ handlerName: 'h' })).toThrow(/handler function/);
    expect(() => new IdempotentHandler({ handlerName: 'h', handler: () => {} })).toThrow(/inboxRepository/);
  });
});
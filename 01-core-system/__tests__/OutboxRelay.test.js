'use strict';

const OutboxRelay = require('../OutboxRelay');

describe('OutboxRelay.runOnce', () => {
  test('continues processing the batch if recording a failed retry also fails', async () => {
    const rows = [
      { id: 'event-1', event_type: 'TestEvent', payload: {}, aggregate_id: 'trip-1' },
      { id: 'event-2', event_type: 'TestEvent', payload: {}, aggregate_id: 'trip-2' },
    ];
    const outboxRepository = {
      fetchPending: jest.fn().mockResolvedValue(rows),
      markPublished: jest.fn().mockResolvedValue({ id: 'event-2', status: 'PUBLISHED' }),
      markFailed: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const eventBus = {
      publishAsync: jest.fn()
        .mockRejectedValueOnce(new Error('consumer unavailable'))
        .mockResolvedValueOnce([]),
    };
    const logger = { error: jest.fn() };
    const relay = new OutboxRelay({ outboxRepository, eventBus, logger });

    await expect(relay.runOnce()).resolves.toBe(1);

    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ message: 'consumer unavailable' }),
      { maxRetries: 5 },
    );
    expect(outboxRepository.markPublished).toHaveBeenCalledTimes(1);
    expect(outboxRepository.markPublished).toHaveBeenCalledWith('event-2');
    expect(relay.stats).toMatchObject({ published: 1, failed: 1 });
    expect(logger.error).toHaveBeenCalled();
  });

  test('does not mark TripCompleted published when only fire-and-forget publish is available', async () => {
    const row = { id: 'event-3', event_type: 'TripCompleted', payload: {}, aggregate_id: 'trip-3' };
    const outboxRepository = {
      fetchPending: jest.fn().mockResolvedValue([row]),
      markPublished: jest.fn(),
      markFailed: jest.fn().mockResolvedValue({ id: row.id, status: 'PENDING' }),
    };
    const eventBus = { publish: jest.fn() };
    const relay = new OutboxRelay({
      outboxRepository,
      eventBus,
      logger: { error: jest.fn() },
    });

    await expect(relay.runOnce()).resolves.toBe(0);

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(outboxRepository.markPublished).not.toHaveBeenCalled();
    expect(outboxRepository.markFailed).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ message: 'Async consumer acknowledgement is required for TripCompleted' }),
      { maxRetries: 5 },
    );
    expect(relay.stats).toMatchObject({ published: 0, failed: 1 });
  });

  test('preserves synchronous fallback for non-critical events', async () => {
    const row = { id: 'event-4', event_type: 'TestEvent', payload: { value: 1 }, aggregate_id: 'trip-4' };
    const outboxRepository = {
      fetchPending: jest.fn().mockResolvedValue([row]),
      markPublished: jest.fn().mockResolvedValue({ id: row.id, status: 'PUBLISHED' }),
      markFailed: jest.fn(),
    };
    const eventBus = { publish: jest.fn() };
    const relay = new OutboxRelay({ outboxRepository, eventBus, logger: { error: jest.fn() } });

    await expect(relay.runOnce()).resolves.toBe(1);

    expect(eventBus.publish).toHaveBeenCalledWith('TestEvent', {
      value: 1,
      eventId: row.id,
      aggregateId: row.aggregate_id,
    });
    expect(outboxRepository.markPublished).toHaveBeenCalledWith(row.id);
    expect(outboxRepository.markFailed).not.toHaveBeenCalled();
  });

  test.each(['TripCompleted', 'TripCreated', 'TripCancelled'])(
    'does not mark %s published when no consumer acknowledges it',
    async (eventType) => {
      const row = { id: `missing-ack-${eventType}`, event_type: eventType, payload: {}, aggregate_id: 'trip-5' };
      const outboxRepository = {
        fetchPending: jest.fn().mockResolvedValue([row]),
        markPublished: jest.fn(),
        markFailed: jest.fn().mockResolvedValue({ id: row.id, status: 'PENDING' }),
      };
      const eventBus = { publishAsync: jest.fn().mockResolvedValue([]) };
      const relay = new OutboxRelay({ outboxRepository, eventBus, logger: { error: jest.fn() } });

      await expect(relay.runOnce()).resolves.toBe(0);

      expect(outboxRepository.markPublished).not.toHaveBeenCalled();
      expect(outboxRepository.markFailed).toHaveBeenCalledWith(
        row.id,
        expect.objectContaining({ message: `Missing consumer acknowledgement for ${eventType}` }),
        { maxRetries: 5 },
      );
    },
  );

  test.each(['TripCompleted', 'TripCreated', 'TripCancelled'])(
    'does not treat undefined-only listeners as an acknowledgement for %s',
    async (eventType) => {
      const row = { id: `undefined-ack-${eventType}`, event_type: eventType, payload: {}, aggregate_id: 'trip-6' };
      const outboxRepository = {
        fetchPending: jest.fn().mockResolvedValue([row]),
        markPublished: jest.fn(),
        markFailed: jest.fn().mockResolvedValue({ id: row.id, status: 'PENDING' }),
      };
      const eventBus = { publishAsync: jest.fn().mockResolvedValue([undefined, undefined]) };
      const relay = new OutboxRelay({ outboxRepository, eventBus, logger: { error: jest.fn() } });

      await expect(relay.runOnce()).resolves.toBe(0);

      expect(outboxRepository.markPublished).not.toHaveBeenCalled();
      expect(outboxRepository.markFailed).toHaveBeenCalledWith(
        row.id,
        expect.objectContaining({ message: `Missing consumer acknowledgement for ${eventType}` }),
        { maxRetries: 5 },
      );
    },
  );

  test('accepts explicit no-hold acknowledgement for TripCancelled', async () => {
    const row = { id: 'event-7', event_type: 'TripCancelled', payload: {}, aggregate_id: 'trip-7' };
    const outboxRepository = {
      fetchPending: jest.fn().mockResolvedValue([row]),
      markPublished: jest.fn().mockResolvedValue({ id: row.id, status: 'PUBLISHED' }),
      markFailed: jest.fn(),
    };
    const eventBus = {
      publishAsync: jest.fn().mockResolvedValue([{ released: false, reason: 'no_held_amount' }]),
    };
    const relay = new OutboxRelay({ outboxRepository, eventBus, logger: { error: jest.fn() } });

    await expect(relay.runOnce()).resolves.toBe(1);
    expect(outboxRepository.markPublished).toHaveBeenCalledWith(row.id);
    expect(outboxRepository.markFailed).not.toHaveBeenCalled();
  });

});

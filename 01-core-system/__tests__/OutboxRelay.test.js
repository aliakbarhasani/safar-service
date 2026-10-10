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
});

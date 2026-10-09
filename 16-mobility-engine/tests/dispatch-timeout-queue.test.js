'use strict';

const { DispatchTimeoutQueue } = require('../infrastructure/queue/DispatchTimeoutQueue');

describe('DispatchTimeoutQueue fallback', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs timeout handler when BullMQ is unavailable', async () => {
    jest.useFakeTimers();
    const tripDispatchService = {
      handleDispatchTimeout: jest.fn().mockResolvedValue({ status: 'ALREADY_RESOLVED' }),
    };
    const queue = new DispatchTimeoutQueue({ tripDispatchService, timeoutMs: 100 });

    await queue.scheduleTimeout('trip-123', 100);
    await jest.advanceTimersByTimeAsync(100);

    expect(tripDispatchService.handleDispatchTimeout).toHaveBeenCalledWith('trip-123');
    await queue.close();
  });

  test('replaces an existing fallback timer for the same trip', async () => {
    jest.useFakeTimers();
    const tripDispatchService = {
      handleDispatchTimeout: jest.fn().mockResolvedValue({ status: 'ALREADY_RESOLVED' }),
    };
    const queue = new DispatchTimeoutQueue({ tripDispatchService, timeoutMs: 100 });

    await queue.scheduleTimeout('trip-123', 100);
    await jest.advanceTimersByTimeAsync(50);
    await queue.scheduleTimeout('trip-123', 100);
    await jest.advanceTimersByTimeAsync(50);
    expect(tripDispatchService.handleDispatchTimeout).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(50);
    expect(tripDispatchService.handleDispatchTimeout).toHaveBeenCalledTimes(1);
    await queue.close();
  });
});

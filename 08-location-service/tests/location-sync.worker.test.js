/**
 * location-sync.worker.test.js - تست واحد/یکپارچگی برای Write-Behind Worker (P3-2)
 *
 * اطمینان از اینکه:
 * 1. داده‌ها از بافر Redis خوانده می‌شوند (drainHistoryBuffer)
 * 2. متد bulkInsert دیتابیس با پارامترهای صحیح فراخوانی می‌شود
 * 3. تراکنش BEGIN/COMMIT/ROLLBACK به درستی مدیریت می‌شود
 */

const { LocationSyncWorker, createLocationSyncWorker } = require('../workers/location-sync.worker');

describe('LocationSyncWorker - Write-Behind Sync (P3-2)', () => {
  let mockLocationService;
  let mockPool;
  let mockClient;
  let worker;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    mockLocationService = {
      drainHistoryBuffer: jest.fn().mockResolvedValue([]),
      getHistoryBufferSize: jest.fn().mockResolvedValue(0),
    };
    worker = createLocationSyncWorker({
      locationService: mockLocationService,
      pool: mockPool,
      intervalMs: 999999, // غیرفعال کردن اجرای خودکار
    });
  });

  afterEach(() => {
    worker.stop();
  });

  test('should drain buffer and call bulkInsert with correct parameters', async () => {
    const records = [
      { driver_id: 'driver-1', longitude: 51.389, latitude: 35.6892, recorded_at: '2024-01-01T00:00:00Z' },
      { driver_id: 'driver-2', longitude: 51.5, latitude: 35.7, recorded_at: '2024-01-01T00:01:00Z' },
    ];
    mockLocationService.drainHistoryBuffer.mockResolvedValue(records);
    mockClient.query.mockResolvedValue({ rowCount: 2 });

    const result = await worker.sync();

    expect(result.synced).toBe(2);
    expect(mockLocationService.drainHistoryBuffer).toHaveBeenCalledTimes(1);
    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO driver_location_history'),
      expect.arrayContaining([
        ['driver-1', 'driver-2'],
        [51.389, 51.5],
        [35.6892, 35.7],
        ['2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z'],
      ])
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('should handle empty buffer gracefully', async () => {
    mockLocationService.drainHistoryBuffer.mockResolvedValue([]);

    const result = await worker.sync();

    expect(result.synced).toBe(0);
    expect(result.remaining).toBe(0);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  test('should rollback on bulk insert error', async () => {
    const records = [
      { driver_id: 'driver-1', longitude: 51.389, latitude: 35.6892, recorded_at: '2024-01-01T00:00:00Z' },
    ];
    mockLocationService.drainHistoryBuffer.mockResolvedValue(records);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('INSERT failed')); // INSERT

    await expect(worker.sync()).rejects.toThrow('INSERT failed');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('should skip sync if already running (concurrent protection)', async () => {
    mockLocationService.drainHistoryBuffer.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
    );
    worker._running = true;

    const result = await worker.sync();

    expect(result.skipped).toBe(true);
    expect(result.synced).toBe(0);
  });

  test('should handle batch size limit', async () => {
    const records = Array.from({ length: 600 }, (_, i) => ({
      driver_id: `driver-${i}`,
      longitude: 51.0 + i * 0.001,
      latitude: 35.0 + i * 0.001,
      recorded_at: '2024-01-01T00:00:00Z',
    }));
    mockLocationService.drainHistoryBuffer.mockResolvedValue(records);
    mockClient.query.mockResolvedValue({ rowCount: 500 });

    const result = await worker.sync();

    expect(result.synced).toBe(500);
    expect(result.remaining).toBe(100);
  });

  test('should handle missing pool gracefully', async () => {
    const workerNoPool = createLocationSyncWorker({
      locationService: mockLocationService,
      pool: null,
      intervalMs: 999999,
    });
    const records = [
      { driver_id: 'driver-1', longitude: 51.389, latitude: 35.6892, recorded_at: '2024-01-01T00:00:00Z' },
    ];
    mockLocationService.drainHistoryBuffer.mockResolvedValue(records);

    const result = await workerNoPool.sync();

    expect(result.synced).toBe(0);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});
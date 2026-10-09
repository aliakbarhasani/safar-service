/**
 * dispatch-service.test.js - تست یکپارچگی TripDispatchService (P3-3)
 *
 * اعتبارسنجی:
 *   - ست شدن کلید Redis با TTL ۱۵ ثانیه
 *   - انتشار رویداد TripProposedToDriver
 *   - انتشار رویداد NoDriverFound در نبود راننده
 *   - انتخاب اولین راننده AVAILABLE (نه اولین راننده در لیست)
 *   - مدیریت تایم‌اوت
 */

const { TripDispatchService } = require('../application/TripDispatchService');

// ماک سرویس مکان‌یابی
function makeLocationService(drivers = []) {
  return {
    findNearbyDrivers: jest.fn().mockResolvedValue(drivers),
  };
}

// ماک سرویس رانندگان
function makeDriverService(driverStatuses = {}) {
  return {
    findById: jest.fn().mockImplementation((id) => {
      const status = driverStatuses[id];
      if (!status) return Promise.resolve(null);
      return Promise.resolve({ id, operationalStatus: status });
    }),
  };
}

// ماک Redis
function makeRedis() {
  const store = new Map();
  return {
    store,
    set: jest.fn().mockImplementation((key, value, ...args) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn().mockImplementation((key) => {
      return Promise.resolve(store.get(key) || null);
    }),
    del: jest.fn().mockImplementation((key) => {
      const existed = store.has(key);
      store.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
  };
}

// ماک EventBus
function makeEventBus() {
  const events = [];
  return {
    events,
    publish: jest.fn().mockImplementation((event, data) => {
      events.push({ event, data });
    }),
  };
}

// ماک Dispatch Timeout Queue (BullMQ)
function makeDispatchTimeoutQueue() {
  return {
    scheduleTimeout: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TripDispatchService', () => {
  describe('dispatchTrip', () => {
    test('should set Redis key with TTL 15s and publish TripProposedToDriver', async () => {
      const locationService = makeLocationService([
        { driverId: 'driver-1', distanceKm: 0.5 },
        { driverId: 'driver-2', distanceKm: 1.2 },
      ]);
      const driverService = makeDriverService({ 'driver-1': 'available' });
      const redis = makeRedis();
      const eventBus = makeEventBus();

      const service = new TripDispatchService({
        locationService,
        driverService,
        redisClient: redis,
        eventBus,
        ttlSeconds: 15,
        radiusKm: 3,
      });

      const result = await service.dispatchTrip('trip-123', 51.389, 35.6892);

      expect(result.status).toBe('DRIVER_PROPOSED');
      expect(result.driverId).toBe('driver-1');
      expect(result.tripId).toBe('trip-123');

      expect(redis.set).toHaveBeenCalledTimes(1);
      const [key, value, nxFlag, exFlag, exValue] = redis.set.mock.calls[0];
      expect(key).toBe('dispatch:trip:trip-123');
      expect(value).toBe('driver-1');
      expect(nxFlag).toBe('NX');
      expect(exFlag).toBe('EX');
      expect(exValue).toBe(15);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.events[0].event).toBe('TripProposedToDriver');
      expect(eventBus.events[0].data.tripId).toBe('trip-123');
      expect(eventBus.events[0].data.driverId).toBe('driver-1');
    });

    test('should not create a second offer when the trip already has a dispatch key', async () => {
      const locationService = makeLocationService([{ driverId: 'driver-1', distanceKm: 0.5 }]);
      const driverService = makeDriverService({ 'driver-1': 'available' });
      const redis = makeRedis();
      const eventBus = makeEventBus();
      const tripOfferRepository = { createOffer: jest.fn().mockResolvedValue({ status: 'PENDING' }) };
      const service = new TripDispatchService({
        locationService, driverService, redisClient: redis, eventBus, tripOfferRepository,
      });

      const first = await service.dispatchTrip('trip-idempotent', 51.389, 35.6892);
      const second = await service.dispatchTrip('trip-idempotent', 51.389, 35.6892);

      expect(first.status).toBe('DRIVER_PROPOSED');
      expect(second.status).toBe('DRIVER_ALREADY_PROPOSED');
      expect(tripOfferRepository.createOffer).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    test('should publish NoDriverFound when no drivers in radius', async () => {
      const locationService = makeLocationService([]);
      const driverService = makeDriverService({});
      const redis = makeRedis();
      const eventBus = makeEventBus();

      const service = new TripDispatchService({
        locationService,
        driverService,
        redisClient: redis,
        eventBus,
      });

      const result = await service.dispatchTrip('trip-456', 51.389, 35.6892);

      expect(result.status).toBe('NO_DRIVER_FOUND');
      expect(redis.set).not.toHaveBeenCalled();
      expect(eventBus.events[0].event).toBe('NoDriverFound');
    });

    test('should skip unavailable drivers and select first available one', async () => {
      const locationService = makeLocationService([
        { driverId: 'driver-busy', distanceKm: 0.3 },
        { driverId: 'driver-offline', distanceKm: 0.8 },
        { driverId: 'driver-available', distanceKm: 1.5 },
      ]);
      const driverService = makeDriverService({
        'driver-busy': 'busy',
        'driver-offline': 'offline',
        'driver-available': 'available',
      });
      const redis = makeRedis();
      const eventBus = makeEventBus();

      const service = new TripDispatchService({
        locationService,
        driverService,
        redisClient: redis,
        eventBus,
      });

      const result = await service.dispatchTrip('trip-789', 51.389, 35.6892);

      expect(result.status).toBe('DRIVER_PROPOSED');
      expect(result.driverId).toBe('driver-available');
      expect(driverService.findById).toHaveBeenCalledTimes(3);
    });

    test('should publish NoDriverFound when all drivers are unavailable', async () => {
      const locationService = makeLocationService([
        { driverId: 'driver-a', distanceKm: 0.5 },
        { driverId: 'driver-b', distanceKm: 1.0 },
      ]);
      const driverService = makeDriverService({
        'driver-a': 'busy',
        'driver-b': 'offline',
      });
      const redis = makeRedis();
      const eventBus = makeEventBus();

      const service = new TripDispatchService({
        locationService,
        driverService,
        redisClient: redis,
        eventBus,
      });

      const result = await service.dispatchTrip('trip-000', 51.389, 35.6892);

      expect(result.status).toBe('NO_DRIVER_FOUND');
      expect(result.candidatesCount).toBe(2);
      expect(eventBus.events[0].data.reason).toBe('no_available_driver');
    });

    test('should throw if tripId is missing', async () => {
      const service = new TripDispatchService({
        locationService: makeLocationService(),
        driverService: makeDriverService(),
        redisClient: makeRedis(),
      });

      await expect(service.dispatchTrip(null, 51.389, 35.6892)).rejects.toThrow(/tripId/);
    });

    test('should throw if origin coordinates are missing', async () => {
      const service = new TripDispatchService({
        locationService: makeLocationService(),
        driverService: makeDriverService(),
        redisClient: makeRedis(),
      });

      await expect(service.dispatchTrip('trip-1', null, null)).rejects.toThrow(/origin/);
    });
  });

  describe('handleDispatchTimeout', () => {
    test('should return ALREADY_RESOLVED if key does not exist', async () => {
      const redis = makeRedis();
      const service = new TripDispatchService({
        locationService: makeLocationService(),
        driverService: makeDriverService(),
        redisClient: redis,
      });

      const result = await service.handleDispatchTimeout('trip-expired');

      expect(result.status).toBe('ALREADY_RESOLVED');
    });

    test('should delete key and publish TripDispatchTimeout event', async () => {
      const redis = makeRedis();
      redis.store.set('dispatch:trip:trip-timeout', 'driver-old');
      const eventBus = makeEventBus();

      const service = new TripDispatchService({
        locationService: makeLocationService(),
        driverService: makeDriverService(),
        redisClient: redis,
        eventBus,
      });

      const result = await service.handleDispatchTimeout('trip-timeout');

      expect(result.status).toBe('RETRY_INITIATED');
      expect(result.previousDriverId).toBe('driver-old');
      expect(redis.store.has('dispatch:trip:trip-timeout')).toBe(false);
      expect(eventBus.events[0].event).toBe('TripDispatchTimeout');
    });
  });
});

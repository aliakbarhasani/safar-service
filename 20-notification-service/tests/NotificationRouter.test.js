'use strict';

const { PushProvider } = require('../infrastructure/providers/PushProvider');
const { SmsProvider } = require('../infrastructure/providers/SmsProvider');
const { NotificationRouter } = require('../application/NotificationRouter');
const { DriverArrivedHandler } = require('../handlers/DriverArrived.handler');
const { DispatchFailedHandler } = require('../handlers/DispatchFailed.handler');
const { TripCancelledHandler } = require('../handlers/TripCancelled.handler');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('NotificationRouter — Strategy Pattern', () => {
  let pushProvider;
  let smsProvider;
  let router;

  beforeEach(() => {
    pushProvider = new PushProvider({ logger: mockLogger });
    smsProvider = new SmsProvider({ logger: mockLogger });
    router = new NotificationRouter({
      pushProvider,
      smsProvider,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should send push notification for DriverArrived event', async () => {
    const result = await router.dispatch('user-1', 'DriverArrived', { tripId: 'trip-1', driverId: 'drv-1' });

    expect(result.channels).toContain('push');
    expect(result.pushResult.success).toBe(true);
    expect(pushProvider.getSentMessages()).toHaveLength(1);
    expect(pushProvider.getSentMessages()[0].userId).toBe('user-1');
    expect(pushProvider.getSentMessages()[0].title).toBe('راننده رسید');
  });

  test('should send SMS for critical events (DispatchFailed) even with push channel', async () => {
    const result = await router.dispatch('user-2', 'DispatchFailed', { tripId: 'trip-2' });

    expect(result.channels).toContain('push');
    expect(result.channels).toContain('sms');
    expect(smsProvider.getSentMessages()).toHaveLength(1);
    expect(smsProvider.getSentMessages()[0].text).toContain('راننده‌ای یافت نشد');
  });

  test('should send SMS for NoDriverFound event', async () => {
    const result = await router.dispatch('user-3', 'NoDriverFound', { tripId: 'trip-3' });

    expect(result.channels).toContain('sms');
    expect(smsProvider.getSentMessages()[0].text).toContain('راننده‌ای یافت نشد');
  });

  test('should NOT send SMS for non-critical events when push succeeds', async () => {
    const result = await router.dispatch('user-4', 'TripStarted', { tripId: 'trip-4' });

    expect(result.channels).toContain('push');
    expect(result.channels).not.toContain('sms');
    expect(smsProvider.getSentMessages()).toHaveLength(0);
  });

  test('should fallback to SMS when push fails', async () => {
    pushProvider.sendPush = jest.fn().mockRejectedValue(new Error('FCM unavailable'));

    const result = await router.dispatch('user-5', 'TripCompleted', { tripId: 'trip-5', amount: 50000 });

    expect(result.pushResult).toBeUndefined();
    expect(result.pushError).toBe('FCM unavailable');
    expect(result.channels).toContain('sms');
  });

  test('should use custom template when registered', async () => {
    router.registerTemplate('CustomEvent', {
      title: 'عنوان سفارشی',
      buildBody: (p) => `پیام: ${p.message}`,
      forceSms: false,
    });

    const result = await router.dispatch('user-6', 'CustomEvent', { message: 'سلام' });

    expect(result.pushResult.success).toBe(true);
    expect(pushProvider.getSentMessages()[0].title).toBe('عنوان سفارشی');
    expect(pushProvider.getSentMessages()[0].body).toBe('پیام: سلام');
  });

  test('should use default template for unknown events', async () => {
    const result = await router.dispatch('user-7', 'UnknownEvent', {});

    expect(result.pushResult.success).toBe(true);
    expect(pushProvider.getSentMessages()[0].title).toBe('اعلان جدید');
  });

  test('should dispatch to multiple users', async () => {
    const results = await router.dispatchToMany(
      ['user-a', 'user-b', 'user-c'],
      'DriverArrived',
      { tripId: 'trip-x' }
    );

    expect(results).toHaveLength(3);
    expect(pushProvider.getSentMessages()).toHaveLength(3);
  });
});
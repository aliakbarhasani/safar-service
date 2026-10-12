'use strict';

const { FareQuoteStore } = require('../infrastructure/FareQuoteStore');

describe('FareQuoteStore read failure semantics', () => {
  test('returns null for an ordinary missing quote', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null) };
    const store = new FareQuoteStore(redis);

    await expect(store.get('quote-1')).resolves.toBeNull();
  });

  test('returns null for a corrupt cached payload', async () => {
    const redis = { get: jest.fn().mockResolvedValue('{not-json') };
    const store = new FareQuoteStore(redis);

    await expect(store.get('quote-1')).resolves.toBeNull();
  });

  test('reports Redis outages as service unavailable rather than quote expiry', async () => {
    const redisFailure = new Error('connection details must not be sent to clients');
    const redis = { get: jest.fn().mockRejectedValue(redisFailure) };
    const store = new FareQuoteStore(redis);

    await expect(store.get('quote-1')).rejects.toMatchObject({
      code: 'FARE_QUOTE_STORE_UNAVAILABLE',
      statusCode: 503,
      message: 'خواندن پیش‌فاکتور موقتاً در دسترس نیست؛ لطفاً دوباره تلاش کنید.',
      cause: redisFailure,
    });
  });
});

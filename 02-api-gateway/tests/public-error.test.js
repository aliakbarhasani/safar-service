'use strict';

const { toPublicApiError } = require('../utils/public-error');

describe('toPublicApiError', () => {
  test('preserves a documented client validation error', () => {
    const result = toPublicApiError({
      code: 'FARE_INVALID_COORDS',
      statusCode: 400,
      message: 'مختصات مبدأ و مقصد باید عددی معتبر باشند.',
    });
    expect(result).toEqual({
      statusCode: 400,
      body: {
        success: false,
        error: 'مختصات مبدأ و مقصد باید عددی معتبر باشند.',
        code: 'FARE_INVALID_COORDS',
      },
    });
  });

  test.each([
    'FARE_QUOTE_PERSISTENCE_UNAVAILABLE',
    'FARE_QUOTE_PERSISTENCE_FAILED',
  ])('maps %s to a safe service-unavailable response', (code) => {
    const result = toPublicApiError({
      code,
      statusCode: 503,
      message: 'ذخیره‌سازی پیش‌فاکتور موقتاً ناموفق بود؛ لطفاً دوباره تلاش کنید.',
    });

    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({
      success: false,
      error: 'ذخیره‌سازی پیش‌فاکتور موقتاً ناموفق بود؛ لطفاً دوباره تلاش کنید.',
      code,
    });
  });

  test('keeps an unsupported promo lifecycle explicit without exposing internals', () => {
    const result = toPublicApiError({
      code: 'PROMO_QUOTE_UNSUPPORTED',
      statusCode: 503,
      message: 'اعمال کد تخفیف تا زمان ثبت اتمیک آن در پیش‌فاکتور و سفر غیرفعال است.',
    });
    expect(result.statusCode).toBe(503);
    expect(result.body.code).toBe('PROMO_QUOTE_UNSUPPORTED');
    expect(result.body.error).toContain('ثبت اتمیک');
  });

  test('hides raw database and infrastructure errors, even if they carry a status', () => {
    const result = toPublicApiError({
      code: 'ECONNREFUSED',
      statusCode: 400,
      message: 'postgres://internal-host:5432 failed with password details',
    });
    expect(result).toEqual({
      statusCode: 500,
      body: {
        success: false,
        error: 'محاسبه قیمت در حال حاضر ممکن نیست. لطفاً بعداً دوباره تلاش کنید.',
        code: 'INTERNAL_ERROR',
      },
    });
  });

  test('does not trust a caller-supplied status for unknown errors', () => {
    const result = toPublicApiError({
      code: 'UNEXPECTED_ERROR',
      statusCode: 418,
      message: 'internal stack detail',
    });
    expect(result.statusCode).toBe(500);
    expect(result.body.error).not.toContain('internal');
  });
});

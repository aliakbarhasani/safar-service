'use strict';

// Only errors deliberately defined by the fare-estimation contract may expose
// their message to callers. Database, Redis, and unexpected errors stay opaque.
const PUBLIC_FARE_ERRORS = Object.freeze({
  FARE_INVALID_COORDS: 400,
  FARE_INVALID_SERVICE_TYPE: 400,
  FARE_CONFIG_INVALID: 503,
  PROMO_AUTH_REQUIRED: 401,
  PROMO_QUOTE_UNSUPPORTED: 503,
  PROMO_SERVICE_UNAVAILABLE: 503,
  PROMO_RESULT_INVALID: 503,
});

function toPublicApiError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const statusCode = Object.prototype.hasOwnProperty.call(PUBLIC_FARE_ERRORS, code)
    ? PUBLIC_FARE_ERRORS[code]
    : 500;

  if (statusCode !== 500 && typeof error?.message === 'string' && error.message.trim()) {
    return {
      statusCode,
      body: { success: false, error: error.message, code },
    };
  }

  return {
    statusCode: 500,
    body: {
      success: false,
      error: 'محاسبه قیمت در حال حاضر ممکن نیست. لطفاً بعداً دوباره تلاش کنید.',
      code: 'INTERNAL_ERROR',
    },
  };
}

module.exports = { toPublicApiError, PUBLIC_FARE_ERRORS };

/**
 * درخواست تاکسی
 *
 * تا زمانی که فرانت‌اند جریان کامل quote (قیمت معتبر + مختصات مبدأ و مقصد)
 * را به API متصل نکرده است، موفقیت ساختگی یا شناسهٔ تصادفی سفر برنمی‌گردانیم.
 */
export async function requestTaxiRide(_rideData) {
  const error = new Error(
    "ثبت واقعی سفر هنوز به جریان کامل قیمت‌گذاری و API سفر متصل نشده است؛ درخواست ثبت نشده است."
  );
  error.code = "TRIP_API_NOT_CONNECTED";
  throw error;
}

/**
 * pricing.gateway.js - Gateway سرویس قیمت‌گذاری (Decoupling Layer)
 * 
 * این Gateway لایه انتزاعی بین Trip Engine و Pricing Engine است.
 * Trip Service هرگز مستقیماً Pricing Engine را فراخوانی نمی‌کند.
 * 
 * معماری:
 *   - تمام ارتباط با Pricing Engine از این Gateway عبور می‌کند
 *   - در فاز اول، از EventBus برای درخواست قیمت استفاده می‌کند
 *   - در فازهای بعدی، می‌تواند به REST API یا gRPC تغییر کند
 *   - تغییر در Pricing Engine فقط نیازمند تغییر در این Gateway است
 */

const eventBus = require('../../01-core-system/EventBus');
const config = require('../../14-config-system/server.config');

/**
 * دریافت پیش‌فاکتور قیمت از Pricing Engine
 * 
 * @param {Object} tripDetails - جزئیات سفر برای محاسبه قیمت
 * @param {string} tripDetails.serviceType - نوع سرویس
 * @param {number} [tripDetails.originLatitude] - عرض مبدأ
 * @param {number} [tripDetails.originLongitude] - طول مبدأ
 * @param {number} [tripDetails.destinationLatitude] - عرض مقصد
 * @param {number} [tripDetails.destinationLongitude] - طول مقصد
 * @param {number} [tripDetails.distanceKm] - مسافت
 * @param {number} [tripDetails.durationMin] - مدت زمان
 * @param {string} [tripDetails.countryId] - کد کشور
 * @param {string} [tripDetails.currencyId] - کد ارز
 * @returns {Object} قیمت محاسبه شده
 */
async function getQuote(tripDetails) {
  const {
    serviceType, originLatitude, originLongitude,
    destinationLatitude, destinationLongitude,
    distanceKm, durationMin, countryId, currencyId
  } = tripDetails;

  /*
   * فاز اول: استفاده از مقدار پیش‌فرض موقتی
   * فاز دوم: ارسال درخواست از طریق EventBus
   * فاز سوم: REST API call به microservice 15-pricing-engine
   * 
   * مثال فاز دوم:
   * return new Promise((resolve, reject) => {
   *   const timeout = setTimeout(() => reject(new Error('Pricing engine timeout')), 5000);
   *   eventBus.subscribeOnce('PricingQuoteCalculated', (data) => {
   *     clearTimeout(timeout);
   *     resolve(data.quote);
   *   });
   *   eventBus.publish('PricingQuoteRequested', { tripDetails, requestId });
   * });
   */

  const tripCost = config.trip?.defaultCost || 50000;
  const rates = config.trip?.commissionRates || {};
  const commissionRate = rates[serviceType] || 10;
  const commissionAmount = Math.round((tripCost * commissionRate) / 100);
  const driverEarning = tripCost - commissionAmount;

  return {
    estimatedCost: tripCost,
    baseFare: tripCost,
    commissionRate,
    commissionAmount,
    driverEarning,
    currencyId: currencyId || null,
  };
}

/**
 * دریافت قیمت نهایی پس از اتمام سفر
 * 
 * @param {string} tripId - شناسه سفر
 * @param {Object} finalDetails - جزئیات نهایی
 * @returns {Object} قیمت نهایی
 */
async function getFinalPrice(tripId, finalDetails) {
  // TODO: در فازهای بعدی، از Pricing Engine قیمت نهایی دریافت می‌شود
  // برای فعلاً همان قیمت تخمینی را برمی‌گرداند
  return finalDetails;
}

module.exports = {
  getQuote,
  getFinalPrice,
};
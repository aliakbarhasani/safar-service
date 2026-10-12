/**
 * CalculateFareUseCase.js - Application Layer (Pricing Service, P6-1)
 *
 * Computes an estimated fare for a passenger before the trip is requested:
 *
 *   base_price = (distanceKm × perKmRate) + baseFare
 *   surge      = 1.0 when demand ≤ supply, else clamp(ratio, 1.1, MAX_SURGE)
 *   final      = round(base_price × surge)
 *
 * The demand/surge ratio is read from the Supply & Demand tracker via the
 * origin region's geohash (precision 5 ≈ 5×5 km). Returns
 * { estimatedFare, distance, surgeMultiplier }.
 */

const ngeohash = require('ngeohash');
const crypto = require('crypto');
const config = require('../../14-config-system/server.config');
const { isValidServiceType } = require('../../01-core-system/constants/ServiceTypes');

const GEOHASH_PRECISION = 5;
const MAX_SURGE = 2.0;
const SURGE_FLOOR = 1.1;
const QUOTE_TTL_SECONDS = 300; // 5 دقیقه (P6-2)

// (P10-1) کلیدهای تنظیمات پویا — به جای خواندن مستقیم از config
const CONFIG_KEYS = {
  perKmRate: 'trip.perKmRate',
  baseFare: 'trip.baseFare',
  maxSurge: 'trip.maxSurge',
};

/** Haversine distance in kilometres between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Round to 2 decimals. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Surge multiplier from a demand/supply ratio.
 * ratio ≤ 1  -> 1.0 (no surge)
 * ratio > 1  -> clamp(ratio, 1.1, MAX_SURGE)
 */
function computeSurge(ratio) {
  const r = Number(ratio) || 0;
  if (!(r > 1)) return 1.0;
  return round2(Math.min(Math.max(r, SURGE_FLOOR), MAX_SURGE));
}

class CalculateFareUseCase {
  /**
   * @param {Object} deps
   * @param {import('../infrastructure/DemandSupplyTracker').DemandSupplyTracker} deps.demandSupplyTracker
   * @param {import('../infrastructure/FareQuoteStore').FareQuoteStore} [deps.fareQuoteStore]
   *        (P6-2) وقتی تزریق شود، Quote ضد-دستکاری با quoteId ذخیره میشود.
   * @param {DynamicConfigStore} [deps.dynamicConfigStore]
   *        (P10-1) خواندن تنظیمات پویا از Redis به جای config استاتیک
   * @param {Object} [deps.promoService]
   *        (P10-2) سرویس اعتبارسنجی کد تخفیف — validate({ code, userId, fare })
   *        را با خروجی { valid, discountAmount, finalFare } پیاده‌سازی می‌کند.
   */
  constructor({ demandSupplyTracker, fareQuoteStore = null, dynamicConfigStore = null, promoService = null, pricingRepository = null }) {
    if (!demandSupplyTracker) {
      throw new Error('CalculateFareUseCase: demandSupplyTracker is required');
    }
    this.tracker = demandSupplyTracker;
    this.fareQuoteStore = fareQuoteStore;
    this.configStore = dynamicConfigStore;
    this.promoService = promoService;
    this.pricingRepository = pricingRepository;
  }

  /**
   * @param {Object} input
   * @param {number} input.originLat
   * @param {number} input.originLng
   * @param {number} input.destLat
   * @param {number} input.destLng
   * @param {number} [input.perKmRate] - override config per-km rate
   * @param {number} [input.baseFare] - override config base fare
   * @param {number} [input.supply] - optional explicit supply (tests)
   * @param {string} [input.promoCode] - optional promo code for discount (P10-2)
   * @returns {Promise<{ estimatedFare:number, distance:number, surgeMultiplier:number, geohash:string, discountAmount?:number, finalFare?:number, promoCode?:string }>}
   */
  async execute({ originLat, originLng, destLat, destLng, serviceType = 'urban_taxi', perKmRate = null, baseFare = null, supply = null, promoCode = null, userId = null }) {
    const oLat = Number(originLat);
    const oLng = Number(originLng);
    const dLat = Number(destLat);
    const dLng = Number(destLng);

    if ([oLat, oLng, dLat, dLng].some((v) => !Number.isFinite(v))) {
      const err = new Error('مختصات مبدأ و مقصد باید عددی معتبر باشند.');
      err.code = 'FARE_INVALID_COORDS';
      err.statusCode = 400;
      throw err;
    }
    if (oLng < -180 || oLng > 180 || dLng < -180 || dLng > 180) {
      const err = new Error('طول جغرافیایی باید بین -180 و 180 باشد.');
      err.code = 'FARE_INVALID_COORDS';
      err.statusCode = 400;
      throw err;
    }
    if (oLat < -90 || oLat > 90 || dLat < -90 || dLat > 90) {
      const err = new Error('عرض جغرافیایی باید بین -90 و 90 باشد.');
      err.code = 'FARE_INVALID_COORDS';
      err.statusCode = 400;
      throw err;
    }

    if (!isValidServiceType(serviceType)) {
      const err = new Error('نوع سرویس برای محاسبه قیمت نامعتبر است.');
      err.code = 'FARE_INVALID_SERVICE_TYPE';
      err.statusCode = 400;
      throw err;
    }

    const distance = round2(haversineKm(oLat, oLng, dLat, dLng));

    // (P10-1) خواندن تنظیمات پویا از DynamicConfigStore (با fallback به config استاتیک)
    let rate, base;
    if (this.configStore) {
      const configuredRate = Number((config.trip || {}).perKmRate);
      const configuredBase = Number((config.trip || {}).baseFare);
      const fallbackRate = Number.isFinite(configuredRate) && configuredRate >= 0 ? configuredRate : 2000;
      const fallbackBase = Number.isFinite(configuredBase) && configuredBase >= 0 ? configuredBase : 15000;
      rate = perKmRate != null ? Number(perKmRate) : (await this.configStore.getConfig(CONFIG_KEYS.perKmRate, fallbackRate));
      base = baseFare != null ? Number(baseFare) : (await this.configStore.getConfig(CONFIG_KEYS.baseFare, fallbackBase));
    } else {
      const configuredRate = Number((config.trip || {}).perKmRate);
      const configuredBase = Number((config.trip || {}).baseFare);
      rate = perKmRate != null ? Number(perKmRate) : (Number.isFinite(configuredRate) && configuredRate >= 0 ? configuredRate : 2000);
      base = baseFare != null ? Number(baseFare) : (Number.isFinite(configuredBase) && configuredBase >= 0 ? configuredBase : 15000);
    }
    if (![rate, base].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) {
      const err = new Error('تنظیمات کرایه معتبر نیست.');
      err.code = 'FARE_CONFIG_INVALID';
      err.statusCode = 503;
      throw err;
    }
    rate = Number(rate);
    base = Number(base);

    const geohash = ngeohash.encode(oLat, oLng, GEOHASH_PRECISION);
    const { ratio } = await this.tracker.getSupplyAndDemand(geohash, { supply });
    const surgeMultiplier = computeSurge(ratio);

    const basePrice = distance * rate + base;
    const estimatedFare = Math.round(basePrice * surgeMultiplier);

    const result = { estimatedFare, distance, surgeMultiplier, geohash, demandRatio: ratio, serviceType };

    // Promo codes are user-specific and must never be silently ignored.
    // The public estimate endpoint has no authenticated user, so it cannot apply
    // a promo code. Also refuse to discount a protected quote until the discount
    // and promo reference are persisted in the SQL quote consumed by trip creation.
    if (promoCode) {
      const promoError = (message, code, statusCode) => {
        const error = new Error(message);
        error.code = code;
        error.statusCode = statusCode;
        return error;
      };
      if (!userId) {
        throw promoError('برای استفاده از کد تخفیف ابتدا وارد حساب کاربری شوید.', 'PROMO_AUTH_REQUIRED', 401);
      }

      // FAIL CLOSED: the current quote persistence path writes the undiscounted
      // fare to PostgreSQL and does not bind the promo/user/discount to the quote.
      // Never return a discount that trip creation and settlement cannot honor.
      throw promoError(
        'اعمال کد تخفیف تا زمان ثبت اتمیک آن در پیش‌فاکتور و سفر غیرفعال است.',
        'PROMO_QUOTE_UNSUPPORTED',
        503,
      );
    }

    // (P6-2) الگوی Fare Quote: ذخیره Quote ضد-دستکاری در Redis با TTL 5 دقیقه.
    // Mobility در ساخت سفر فقط quoteId را میپذیرد و قیمت را از همین Quote میخواند.
    if (this.fareQuoteStore) {
      const quoteId = crypto.randomUUID();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + this.fareQuoteStore.ttlSeconds * 1000);
      const quote = {
        quoteId,
        serviceType,
        estimatedFare,
        distance,
        surgeMultiplier,
        geohash,
        originLat: oLat,
        originLng: oLng,
        destLat: dLat,
        destLng: dLng,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      try {
        // SQL row and Redis payload share one ID: trips.quote_id has an FK to quotes.id.
        // Persist the audit/foreign-key record first; only expose the quote ID after
        // the coordinate-bound Redis payload is also stored successfully.
        if (this.pricingRepository && typeof this.pricingRepository.saveFareQuote === 'function') {
          await this.pricingRepository.saveFareQuote({
            quoteId,
            serviceType,
            estimatedFare,
            currencyCode: 'IRT',
            expiresAt: quote.expiresAt,
            inputSnapshot: {
              serviceType,
              originLat: oLat,
              originLng: oLng,
              destLat: dLat,
              destLng: dLng,
              distance,
            },
            calculationSnapshot: {
              estimatedFare,
              distance,
              surgeMultiplier,
              geohash,
              demandRatio: ratio,
            },
          });
        }
        await this.fareQuoteStore.save(quote);
        result.quoteId = quoteId;
        result.expiresAt = quote.expiresAt;
      } catch (error) {
        // Without both stores, do not expose a quote ID that cannot create a trip.
        console.warn('[pricing] fare quote persistence failed:', error.message);
      }
    }

    return result;
  }
}

CalculateFareUseCase.MAX_SURGE = MAX_SURGE;
CalculateFareUseCase.SURGE_FLOOR = SURGE_FLOOR;

module.exports = {
  CalculateFareUseCase,
  computeSurge,
  haversineKm,
  round2,
  GEOHASH_PRECISION,
  MAX_SURGE,
  SURGE_FLOOR,
};
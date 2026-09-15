'use strict';

/**
 * TripOfferRepository.js - Mobility Engine Infrastructure (P13-2)
 *
 * پیشنهاد سفر به راننده و قفل توزیع‌شده روی Redis:
 *   - `createOffer(tripId, driverId, expireSeconds = 15)`
 *       کلید `offer:{tripId}:{driverId}` با TTL پانزده ثانیه (SET ... EX)
 *   - `getOffer(tripId, driverId)`
 *       وضعیت آفر؛ `null` یعنی آفر وجود ندارد یا منقضی شده است
 *   - `lockTrip(tripId)`
 *       قفل توزیع‌شده با `SET key value NX EX <ttl>` (الگوی SETNX):
 *       فقط اولین راننده مقدار `OK` می‌گیرد و بقیه رد می‌شوند (پذیرش یکتا)
 *   - `releaseLock(tripId)`
 *       آزادسازی قفل در صورت شکست مراحل بعدی (تا تلاش مجدد ممکن بماند)
 *
 * کلاینت Redis تزریق می‌شود (DIP — تست‌پذیری با Mock).
 */

const OFFER_KEY_PREFIX = 'offer:';
const TRIP_LOCK_PREFIX = 'trip_lock:';
const DEFAULT_OFFER_TTL_SECONDS = 15;
const DEFAULT_LOCK_TTL_SECONDS = 30;

const OFFER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
});

class TripOfferRepository {
  /**
   * @param {Object} deps
   * @param {Object} deps.redisClient - کلاینت Redis (ioredis)
   * @param {number} [deps.offerTtlSeconds] - TTL پیش‌فرض آفر
   * @param {number} [deps.lockTtlSeconds] - TTL قفل سفر
   */
  constructor({
    redisClient,
    offerTtlSeconds = DEFAULT_OFFER_TTL_SECONDS,
    lockTtlSeconds = DEFAULT_LOCK_TTL_SECONDS,
  } = {}) {
    if (!redisClient) throw new Error('TripOfferRepository requires a redisClient');
    this.redis = redisClient;
    this.offerTtlSeconds = offerTtlSeconds;
    this.lockTtlSeconds = lockTtlSeconds;
  }

  /** @private کلید آفر: offer:{tripId}:{driverId} */
  _offerKey(tripId, driverId) {
    return `${OFFER_KEY_PREFIX}${tripId}:${driverId}`;
  }

  /** @private کلید قفل سفر: trip_lock:{tripId} */
  _lockKey(tripId) {
    return `${TRIP_LOCK_PREFIX}${tripId}`;
  }

  /**
   * ایجاد پیشنهاد سفر برای یک راننده با TTL مشخص.
   * @param {string} tripId
   * @param {string} driverId
   * @param {number} [expireSeconds=15]
   * @returns {Promise<Object>} آفر ایجادشده
   */
  async createOffer(tripId, driverId, expireSeconds = DEFAULT_OFFER_TTL_SECONDS) {
    if (!tripId || !driverId) {
      const error = new Error('TripOfferRepository.createOffer: tripId و driverId الزامی هستند.');
      error.code = 'OFFER_VALIDATION';
      error.statusCode = 400;
      throw error;
    }
    const ttl = Number(expireSeconds);
    if (!Number.isInteger(ttl) || ttl <= 0) {
      const error = new Error('TripOfferRepository.createOffer: expireSeconds باید عدد صحیح مثبت باشد.');
      error.code = 'OFFER_TTL_VALIDATION';
      error.statusCode = 400;
      throw error;
    }

    const now = Date.now();
    const offer = {
      tripId: String(tripId),
      driverId: String(driverId),
      status: OFFER_STATUS.PENDING,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl * 1000).toISOString(),
    };

    // SET offer:{tripId}:{driverId} <json> EX <ttl>
    await this.redis.set(this._offerKey(tripId, driverId), JSON.stringify(offer), 'EX', ttl);
    return offer;
  }

  /**
   * خواندن وضعیت آفر — `null` یعنی منقضی/ناموجود.
   * @returns {Promise<Object|null>}
   */
  async getOffer(tripId, driverId) {
    if (!tripId || !driverId) return null;
    const raw = await this.redis.get(this._offerKey(tripId, driverId));
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (_) {
      // مقدار خراب/غیر JSON: به‌عنوان آفر موجود ولی بدون متادیتا پذیرفته می‌شود
      return { tripId: String(tripId), driverId: String(driverId), status: OFFER_STATUS.PENDING };
    }
  }

  /**
   * قفل توزیع‌شده سفر (SETNX): فقط یک راننده می‌تواند سفر را بردارد.
   * @param {string} tripId
   * @param {string|number|null} [ownerId] - مقدار قفل (معمولاً driverId)
   * @returns {Promise<boolean>} true اگر قفل گرفته شد
   */
  async lockTrip(tripId, ownerId = null) {
    if (!tripId) throw new Error('TripOfferRepository.lockTrip: tripId الزامی است.');
    const result = await this.redis.set(
      this._lockKey(tripId),
      ownerId === null || ownerId === undefined ? '1' : String(ownerId),
      'NX',
      'EX',
      this.lockTtlSeconds,
    );
    // ioredis: 'OK' در صورت گرفتن قفل، null وقتی کلید از قبل وجود دارد
    return result === 'OK' || result === true;
  }

  /** آزادسازی قفل سفر (فقط در مسیر شکست استفاده می‌شود). */
  async releaseLock(tripId) {
    if (!tripId) throw new Error('TripOfferRepository.releaseLock: tripId الزامی است.');
    return this.redis.del(this._lockKey(tripId));
  }
}

module.exports = TripOfferRepository;
module.exports.TripOfferRepository = TripOfferRepository;
module.exports.OFFER_STATUS = OFFER_STATUS;
module.exports.DEFAULT_OFFER_TTL_SECONDS = DEFAULT_OFFER_TTL_SECONDS;
module.exports.DEFAULT_LOCK_TTL_SECONDS = DEFAULT_LOCK_TTL_SECONDS;
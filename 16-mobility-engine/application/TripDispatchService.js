/**
 * TripDispatchService.js - Smart Dispatch Engine with Redis TTL (P3-3)
 *
 * پیاده‌سازی موتور تخصیص هوشمند سفر به راننده:
 *   1) یافتن رانندگان نزدیک از مبدأ سفر (شعاع ۳ کیلومتر)
 *   2) انتخاب اولین راننده ONLINE و AVAILABLE
 *   3) ذخیره کاندیدا در Redis با TTL ۱۵ ثانیه (جلوگیری از ارسال همزمان)
 *   4) انتشار رویداد TripProposedToDriver
 *   5) مدیریت Time-out: اگر راننده قبول نکرد، راننده بعدی انتخاب شود
 *
 * Dependency Injection: تمام وابستگی‌ها تزریق می‌شوند (Clean Architecture).
 */

const DISPATCH_KEY_PREFIX = 'dispatch:trip:';
const DISPATCH_TTL_SECONDS = 15;
const DISPATCH_RADIUS_KM = 3;

class TripDispatchService {
  /**
   * @param {Object} deps
   * @param {Object} deps.locationService - سرویس مکان‌یابی (findNearbyDrivers)
   * @param {Object} deps.driverService - سرویس رانندگان (findById)
   * @param {Object} deps.redisClient - کلاینت Redis (set/expires)
   * @param {Object} [deps.eventBus] - EventBus مرکزی
   * @param {number} [deps.ttlSeconds] - TTL کلید Redis (پیش‌فرض ۱۵)
   * @param {number} [deps.radiusKm] - شعاع جستجو بر حسب کیلومتر
   */
  constructor({
    locationService,
    driverService,
    redisClient,
    eventBus = null,
    dispatchTimeoutQueue = null,
    tripOfferRepository = null,
    ttlSeconds = DISPATCH_TTL_SECONDS,
    radiusKm = DISPATCH_RADIUS_KM,
  } = {}) {
    if (!locationService) throw new Error('TripDispatchService: locationService is required');
    if (!driverService) throw new Error('TripDispatchService: driverService is required');
    if (!redisClient) throw new Error('TripDispatchService: redisClient is required');

    this.locationService = locationService;
    this.driverService = driverService;
    this.redis = redisClient;
    this.eventBus = eventBus;
    this.dispatchTimeoutQueue = dispatchTimeoutQueue;
    this.tripOfferRepository = tripOfferRepository;
    this.ttlSeconds = ttlSeconds;
    this.radiusKm = radiusKm;
  }

  /**
   * تخصیص هوشمند سفر به راننده.
   * @param {string} tripId - شناسه سفر
   * @param {number} originLon - طول جغرافیایی مبدأ
   * @param {number} originLat - عرض جغرافیایی مبدأ
   * @returns {Promise<{status: string, driverId?: string, tripId: string}>}
   */
  async dispatchTrip(tripId, originLon, originLat) {
    if (!tripId) throw new Error('tripId is required');
    if (originLon == null || originLat == null) {
      throw new Error('originLon and originLat are required');
    }
    if (this.redis.status === 'offline') {
      const error = new Error('Redis is unavailable; trip dispatch cannot safely create an offer.');
      error.code = 'DISPATCH_REDIS_UNAVAILABLE';
      error.statusCode = 503;
      throw error;
    }

    // ۱) یافتن رانندگان نزدیک (مرتب‌شده بر اساس فاصله)
    const nearbyDrivers = await this.locationService.findNearbyDrivers(
      originLon,
      originLat,
      this.radiusKm,
    );

    if (!nearbyDrivers || nearbyDrivers.length === 0) {
      this._publishEvent('NoDriverFound', { tripId, reason: 'no_drivers_in_radius' });
      return { status: 'NO_DRIVER_FOUND', tripId };
    }

    // ۲) انتخاب اولین راننده ONLINE و AVAILABLE
    const selectedDriver = await this._selectAvailableDriver(nearbyDrivers, tripId);

    if (!selectedDriver) {
      this._publishEvent('NoDriverFound', {
        tripId,
        reason: 'no_available_driver',
        candidatesCount: nearbyDrivers.length,
      });
      return { status: 'NO_DRIVER_FOUND', tripId, candidatesCount: nearbyDrivers.length };
    }

    // ۳) ذخیره کاندیدا در Redis با TTL (جلوگیری از ارسال همزمان)
    const dispatchKey = this._buildDispatchKey(tripId);
    await this.redis.set(dispatchKey, selectedDriver.driverId, 'EX', this.ttlSeconds);

    // Persist the offer under the key accepted by AcceptTripUseCase.
    // The legacy dispatch key alone is not sufficient to prove the driver was invited.
    if (this.tripOfferRepository) {
      try {
        await this.tripOfferRepository.createOffer(tripId, selectedDriver.driverId, this.ttlSeconds);
      } catch (error) {
        try { await this.redis.del(dispatchKey); } catch (_) { /* TTL is the fallback */ }
        throw error;
      }
    }

    // ۳.۵) زمان‌بندی تایم‌اوت در صف BullMQ (P3-4)
    if (this.dispatchTimeoutQueue) {
      try {
        await this.dispatchTimeoutQueue.scheduleTimeout(tripId, this.ttlSeconds * 1000);
      } catch (err) {
        // خطا در صف تاخیری نباید عملیات اصلی را مختل کند
        console.warn(`[TripDispatchService] failed to schedule timeout for trip ${tripId}:`, err.message);
      }
    }

    // ۴) انتشار رویداد
    this._publishEvent('TripProposedToDriver', {
      tripId,
      driverId: selectedDriver.driverId,
      distanceKm: selectedDriver.distanceKm,
      ttlSeconds: this.ttlSeconds,
    });

    return {
      status: 'DRIVER_PROPOSED',
      driverId: selectedDriver.driverId,
      tripId,
      distanceKm: selectedDriver.distanceKm,
    };
  }

  /**
   * مدیریت تایم‌اوت تخصیص: اگر راننده قبلی سفر را قبول نکرد، راننده بعدی انتخاب شود.
   * @param {string} tripId - شناسه سفر
   * @returns {Promise<{status: string, driverId?: string}>}
   */
  async handleDispatchTimeout(tripId) {
    if (!tripId) throw new Error('tripId is required');

    // بررسی وجود کلید (اگر هنوز منقضی نشده یا راننده قبول نکرده)
    const dispatchKey = this._buildDispatchKey(tripId);
    const existingDriverId = await this.redis.get(dispatchKey);

    if (!existingDriverId) {
      // کلید منقضی شده یا حذف شده (راننده قبلی قبول کرده یا لغو شده)
      return { status: 'ALREADY_RESOLVED', tripId };
    }

    // حذف راننده قبلی و شروع جستجوی مجدد
    await this.redis.del(dispatchKey);

    // انتشار رویداد برای جستجوی مجدد (با راننده بعدی)
    this._publishEvent('TripDispatchTimeout', {
      tripId,
      previousDriverId: existingDriverId,
      message: 'Driver did not accept within timeout, retrying with next driver',
    });

    // پیدا کردن مختصات سفر از طریق یک get کردن ساده (در نسخه کامل از tripRepository)
    // برای سادگی، رویداد را منتشر می‌کنیم و UseCase اصلی dispatchTrip را دوباره فراخوانی می‌کند
    return { status: 'RETRY_INITIATED', tripId, previousDriverId: existingDriverId };
  }

  /**
   * انتخاب اولین راننده در دسترس از لیست رانندگان نزدیک.
   * @param {Array} nearbyDrivers - لیست رانندگان (مرتب‌شده بر اساس فاصله)
   * @param {string} tripId - شناسه سفر (برای لاگ)
   * @returns {Promise<{driverId: string, distanceKm: number}|null>}
   * @private
   */
  async _selectAvailableDriver(nearbyDrivers, tripId) {
    for (const driver of nearbyDrivers) {
      try {
        const driverInfo = await this.driverService.findById(driver.driverId);
        if (driverInfo && driverInfo.operationalStatus === 'available') {
          return { driverId: driver.driverId, distanceKm: driver.distanceKm ?? driver.distance ?? null };
        }
      } catch (err) {
        // خطا در دریافت اطلاعات راننده -> ادامه به راننده بعدی
        console.warn(`[TripDispatchService] failed to check driver ${driver.driverId}:`, err.message);
      }
    }
    return null;
  }

  /**
   * انتشار رویداد روی EventBus (در صورت وجود).
   * @param {string} eventName - نام رویداد
   * @param {Object} data - داده‌های رویداد
   * @private
   */
  _publishEvent(eventName, data) {
    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      this.eventBus.publish(eventName, data);
    }
  }

  /**
   * ساخت کلید Redis برای تخصیص سفر.
   * @param {string} tripId - شناسه سفر
   * @returns {string}
   * @private
   */
  _buildDispatchKey(tripId) {
    return `${DISPATCH_KEY_PREFIX}${tripId}`;
  }
}

module.exports = { TripDispatchService, DISPATCH_KEY_PREFIX, DISPATCH_TTL_SECONDS, DISPATCH_RADIUS_KM };

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
    tripRepository = null,
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
    this.tripRepository = tripRepository;
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
  async dispatchTrip(tripId, originLon, originLat, { excludeDriverIds = [] } = {}) {
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

    const dispatchKey = this._buildDispatchKey(tripId);
    const existingDriverId = await this.redis.get(dispatchKey);
    if (existingDriverId) {
      return { status: 'DRIVER_ALREADY_PROPOSED', tripId, driverId: String(existingDriverId) };
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
    const selectedDriver = await this._selectAvailableDriver(nearbyDrivers, tripId, excludeDriverIds);

    if (!selectedDriver) {
      this._publishEvent('NoDriverFound', {
        tripId,
        reason: 'no_available_driver',
        candidatesCount: nearbyDrivers.length,
      });
      return { status: 'NO_DRIVER_FOUND', tripId, candidatesCount: nearbyDrivers.length };
    }

    // ۳) ذخیره کاندیدا در Redis با TTL (جلوگیری از ارسال همزمان)
    // Claim the dispatch slot atomically; GET followed by SET would race under
    // duplicate TripCreated delivery and could invite multiple drivers.
    const claimed = await this.redis.set(
      dispatchKey,
      selectedDriver.driverId,
      'NX',
      'EX',
      this.ttlSeconds + 10, // keep dispatch marker alive beyond the delayed timeout
    );
    if (claimed !== 'OK' && claimed !== true) {
      const existingDriverId = await this.redis.get(dispatchKey);
      return { status: 'DRIVER_ALREADY_PROPOSED', tripId, driverId: existingDriverId ? String(existingDriverId) : undefined };
    }

    // Persist the offer under the key accepted by AcceptTripUseCase.
    // The legacy dispatch key alone is not sufficient to prove the driver was invited.
    if (this.tripOfferRepository) {
      try {
        await this.tripOfferRepository.createOffer(tripId, selectedDriver.driverId, this.ttlSeconds);
      } catch (error) {
        try {
          const currentDriverId = await this.redis.get(dispatchKey);
          if (String(currentDriverId) === String(selectedDriver.driverId)) {
            await this.redis.del(dispatchKey);
          }
        } catch (_) { /* TTL is the fallback */ }
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

    // Do not re-dispatch trips that were accepted, cancelled, or completed.
    if (!this.tripRepository || typeof this.tripRepository.getTripById !== 'function') {
      const error = new Error('Trip repository is required to safely retry dispatch timeouts.');
      error.code = 'DISPATCH_TRIP_LOOKUP_UNAVAILABLE';
      error.statusCode = 503;
      throw error;
    }
    const trip = await this.tripRepository.getTripById(tripId);
    const status = String(trip && trip.status || '').toUpperCase();
    if (!trip || !['REQUESTED', 'SEARCHING'].includes(status)) {
      await this.redis.del(dispatchKey);
      return { status: 'ALREADY_RESOLVED', tripId };
    }

    // The acceptance path holds this lock through the successful state change.
    // If it exists, don't race an in-flight acceptance with another offer.
    const acceptanceLock = await this.redis.get(`trip_lock:${tripId}`);
    if (acceptanceLock) {
      return { status: 'ALREADY_RESOLVED', tripId };
    }

    await this.redis.del(dispatchKey);
    this._publishEvent('TripDispatchTimeout', {
      tripId,
      previousDriverId: String(existingDriverId),
      message: 'Driver did not accept within timeout; trying the next available driver',
    });

    const originLng = Number(trip.origin_lng);
    const originLat = Number(trip.origin_lat);
    if (!Number.isFinite(originLng) || !Number.isFinite(originLat)) {
      const error = new Error('Trip origin coordinates are unavailable for dispatch retry.');
      error.code = 'DISPATCH_ORIGIN_MISSING';
      error.statusCode = 503;
      throw error;
    }

    return this.dispatchTrip(tripId, originLng, originLat, {
      excludeDriverIds: [String(existingDriverId)],
    });
  }

  /**
   * انتخاب اولین راننده در دسترس از لیست رانندگان نزدیک.
   * @param {Array} nearbyDrivers - لیست رانندگان (مرتب‌شده بر اساس فاصله)
   * @param {string} tripId - شناسه سفر (برای لاگ)
   * @returns {Promise<{driverId: string, distanceKm: number}|null>}
   * @private
   */
  async _selectAvailableDriver(nearbyDrivers, tripId, excludeDriverIds = []) {
    const excluded = new Set((excludeDriverIds || []).map(String));
    for (const driver of nearbyDrivers) {
      if (excluded.has(String(driver.driverId))) continue;
      try {
        const driverInfo = await this.driverService.findById(driver.driverId);
        // DriverService's canonical operational state is "online", not "available".
        if (driverInfo
            && driverInfo.operationalStatus === 'online'
            && driverInfo.accountStatus === 'verified') {
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

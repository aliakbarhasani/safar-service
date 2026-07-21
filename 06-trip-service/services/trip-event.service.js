/**
 * trip-event.service.js - سرویس رویدادهای دامنه سفر
 * 
 * این سرویس ۱۲ رویداد مستقل دامنه را روی EventBus منتشر می‌کند.
 * رویدادها در طول تغییر وضعیت ماشین وضعیت سفر منتشر می‌شوند.
 * 
 * رویدادهای دامنه (۱۲ رویداد):
 *   ۱. TripCreated
 *   ۲. DriverSearchingStarted
 *   ۳. DriverAssigned
 *   ۴. DriverAccepted
 *   ۵. DriverArrived
 *   ۶. PassengerBoarded
 *   ۷. TripStarted
 *   ۸. TripCompleted
 *   ۹. TripCancelledByPassenger
 *   ۱۰. TripCancelledByDriver
 *   ۱۱. TripExpired
 *   ۱۲. TripEmergencyCancelled
 */

const eventBus = require('../../01-core-system/EventBus');

/**
 * لیست تمام رویدادهای دامنه سفر
 */
const TripDomainEvents = {
  TripCreated: 'TripCreated',                       // سفر ایجاد شد
  DriverSearchingStarted: 'DriverSearchingStarted', // جستجوی راننده شروع شد
  DriverAssigned: 'DriverAssigned',                 // راننده تخصیص داده شد
  DriverAccepted: 'DriverAccepted',                 // راننده سفر را پذیرفت
  DriverArrived: 'DriverArrived',                   // راننده به محل رسید
  PassengerBoarded: 'PassengerBoarded',             // مسافر سوار شد
  TripStarted: 'TripStarted',                       // سفر شروع شد
  TripCompleted: 'TripCompleted',                   // سفر به پایان رسید
  TripCancelledByPassenger: 'TripCancelledByPassenger', // لغو توسط مسافر
  TripCancelledByDriver: 'TripCancelledByDriver',       // لغو توسط راننده
  TripExpired: 'TripExpired',                       // سفر منقضی شد
  TripEmergencyCancelled: 'TripEmergencyCancelled', // لغو اضطراری
};

/**
 * انتشار رویداد ایجاد سفر
 */
function emitTripCreated(trip, pricing) {
  eventBus.publish(TripDomainEvents.TripCreated, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    originAddress: trip.origin_address,
    destinationAddress: trip.destination_address,
    estimatedCost: pricing.estimatedCost,
    serviceType: trip.service_type,
    paymentMethod: trip.payment_method,
    currencyId: pricing.currencyId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد جستجوی راننده
 */
function emitDriverSearchingStarted(tripId, passengerId, serviceType) {
  eventBus.publish(TripDomainEvents.DriverSearchingStarted, {
    tripId,
    passengerId,
    serviceType,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد تخصیص راننده
 */
function emitDriverAssigned(trip, driverId) {
  eventBus.publish(TripDomainEvents.DriverAssigned, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId,
    serviceType: trip.service_type,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد پذیرش توسط راننده
 */
function emitDriverAccepted(trip) {
  eventBus.publish(TripDomainEvents.DriverAccepted, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد رسیدن راننده
 */
function emitDriverArrived(trip) {
  eventBus.publish(TripDomainEvents.DriverArrived, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد سوار شدن مسافر
 */
function emitPassengerBoarded(trip) {
  eventBus.publish(TripDomainEvents.PassengerBoarded, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد شروع سفر
 */
function emitTripStarted(trip) {
  eventBus.publish(TripDomainEvents.TripStarted, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    startedAt: trip.started_at || new Date().toISOString(),
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد اتمام سفر (پکیج جامع)
 * این رویداد ماژول‌های Wallet, Ledger, Earnings, Commission, Reviews را فعال می‌کند
 */
function emitTripCompleted(trip) {
  eventBus.publish(TripDomainEvents.TripCompleted, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    finalPrice: trip.final_cost || trip.estimated_cost,
    currencyId: trip.currency_id,
    paymentMethod: trip.payment_method,
    originAddress: trip.origin_address,
    destinationAddress: trip.destination_address,
    originLatitude: trip.origin_latitude,
    originLongitude: trip.origin_longitude,
    destinationLatitude: trip.destination_latitude,
    destinationLongitude: trip.destination_longitude,
    countryId: trip.country_id,
    startedAt: trip.started_at,
    finishedAt: trip.finished_at,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد لغو توسط مسافر
 */
function emitTripCancelledByPassenger(trip, reason) {
  eventBus.publish(TripDomainEvents.TripCancelledByPassenger, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    cancelReason: reason || 'Cancelled by passenger',
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد لغو توسط راننده
 */
function emitTripCancelledByDriver(trip, reason) {
  eventBus.publish(TripDomainEvents.TripCancelledByDriver, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    cancelReason: reason || 'Cancelled by driver',
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد انقضای سفر
 */
function emitTripExpired(trip) {
  eventBus.publish(TripDomainEvents.TripExpired, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد لغو اضطراری
 */
function emitTripEmergencyCancelled(trip, reportedBy, details) {
  eventBus.publish(TripDomainEvents.TripEmergencyCancelled, {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    serviceType: trip.service_type,
    reportedBy,
    details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * انتشار رویداد مناسب بر اساس وضعیت جدید
 */
function emitByStatus(trip, previousStatus, newStatus, extra = {}) {
  switch (newStatus) {
    case 'requested':
      if (!extra.skipCreated) emitTripCreated(trip, extra.pricing || {});
      break;
    case 'searching':
      emitDriverSearchingStarted(trip.id, trip.passenger_id, trip.service_type);
      break;
    case 'accepted':
      emitDriverAssigned(trip, trip.driver_id);
      emitDriverAccepted(trip);
      break;
    case 'arrived':
      emitDriverArrived(trip);
      break;
    case 'in_progress':
      emitPassengerBoarded(trip);
      emitTripStarted(trip);
      break;
    case 'completed':
      emitTripCompleted(trip);
      break;
    case 'cancelled_by_passenger':
      emitTripCancelledByPassenger(trip, trip.cancel_reason);
      break;
    case 'cancelled_by_driver':
      emitTripCancelledByDriver(trip, trip.cancel_reason);
      break;
    case 'expired':
      emitTripExpired(trip);
      break;
    case 'emergency_stop':
    case 'security_investigation':
      emitTripEmergencyCancelled(trip, extra.reportedBy || 'system', extra.details || '');
      break;
  }
}

module.exports = {
  TripDomainEvents,
  emitTripCreated,
  emitDriverSearchingStarted,
  emitDriverAssigned,
  emitDriverAccepted,
  emitDriverArrived,
  emitPassengerBoarded,
  emitTripStarted,
  emitTripCompleted,
  emitTripCancelledByPassenger,
  emitTripCancelledByDriver,
  emitTripExpired,
  emitTripEmergencyCancelled,
  emitByStatus,
};
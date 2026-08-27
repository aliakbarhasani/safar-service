/**
 * trip-state.service.js - مدیریت ماشین وضعیت سفر
 * 
 * این سرویس قوانین تغییر وضعیت سفر (State Machine) را پیاده‌سازی می‌کند.
 * ماشین وضعیت ۹ حالته با پشتیبانی از ۶ نوع سرویس:
 *   taxi, intercity, border_transport, freight, delivery, tourism
 * 
 * REQUESTED → SEARCHING → ACCEPTED → ARRIVED → IN_PROGRESS → COMPLETED
 *                                      ↘ CANCELLED_BY_PASSENGER
 *                                        CANCELLED_BY_DRIVER
 *                                        EXPIRED
 * 
 * هیچ وضعیتی نمی‌تواند به وضعیت قبلی برگردد.
 * وضعیت‌های نهایی: COMPLETED، CANCELLED_BY_PASSENGER، CANCELLED_BY_DRIVER، EXPIRED
 */

const eventBus = require('../../01-core-system/EventBus');
const { ServiceTypes, ALL_SERVICE_TYPES, isValidServiceType } = require('../../01-core-system/constants/ServiceTypes');

// ============================================================================
// Service types - SINGLE SOURCE OF TRUTH (unified dictionary)
// Delegated to 01-core-system/constants/ServiceTypes.js so that no local
// hardcoded list exists here anymore.
// ============================================================================

/** @type {Object<string,string>} */
const ServiceType = ServiceTypes;

// ============================================================================
// ۹ وضعیت استاندارد سفر
// ============================================================================
const TripStatus = {
  REQUESTED: 'requested',
  SEARCHING: 'searching',
  ACCEPTED: 'accepted',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED_BY_PASSENGER: 'cancelled_by_passenger',
  CANCELLED_BY_DRIVER: 'cancelled_by_driver',
  EXPIRED: 'expired',
};

/**
 * وضعیت‌های نهایی (Terminal States)
 * سفر در این وضعیت‌ها دیگر قابل تغییر نیست
 */
const TERMINAL_STATES = [
  TripStatus.COMPLETED,
  TripStatus.CANCELLED_BY_PASSENGER,
  TripStatus.CANCELLED_BY_DRIVER,
  TripStatus.EXPIRED,
];

/**
 * مجوزهای انتقال بین وضعیت‌ها (Transition Map)
 * 
 * هر وضعیت فعلی لیست وضعیت‌های مجازی که می‌تواند به آن‌ها برود را مشخص می‌کند.
 */
const TRANSITION_MAP = {
  [TripStatus.REQUESTED]: [
    TripStatus.SEARCHING,
    TripStatus.CANCELLED_BY_PASSENGER,
    TripStatus.EXPIRED,
  ],
  [TripStatus.SEARCHING]: [
    TripStatus.ACCEPTED,
    TripStatus.CANCELLED_BY_PASSENGER,
    TripStatus.EXPIRED,
  ],
  [TripStatus.ACCEPTED]: [
    TripStatus.ARRIVED,
    TripStatus.CANCELLED_BY_PASSENGER,
    TripStatus.CANCELLED_BY_DRIVER,
    TripStatus.EXPIRED,
  ],
  [TripStatus.ARRIVED]: [
    TripStatus.IN_PROGRESS,
    TripStatus.CANCELLED_BY_PASSENGER,
    TripStatus.CANCELLED_BY_DRIVER,
    TripStatus.EXPIRED,
  ],
  [TripStatus.IN_PROGRESS]: [
    TripStatus.COMPLETED,
  ],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED_BY_PASSENGER]: [],
  [TripStatus.CANCELLED_BY_DRIVER]: [],
  [TripStatus.EXPIRED]: [],
};

/**
 * رویدادهای مرتبط با هر وضعیت
 */
const STATUS_EVENTS = {
  [TripStatus.REQUESTED]: 'TripCreated',
  [TripStatus.SEARCHING]: 'TripSearching',
  [TripStatus.ACCEPTED]: 'TripAccepted',
  [TripStatus.ARRIVED]: 'TripDriverArrived',
  [TripStatus.IN_PROGRESS]: 'TripInProgress',
  [TripStatus.COMPLETED]: 'TripCompleted',
  [TripStatus.CANCELLED_BY_PASSENGER]: 'TripCancelledByPassenger',
  [TripStatus.CANCELLED_BY_DRIVER]: 'TripCancelledByDriver',
  [TripStatus.EXPIRED]: 'TripExpired',
};

// ============================================================================
// توابع ماشین وضعیت
// ============================================================================

/**
 * اعتبارسنجی انتقال وضعیت
 * 
 * @param {string} currentStatus - وضعیت فعلی
 * @param {string} newStatus - وضعیت درخواستی
 * @returns {Object} { valid: boolean, message?: string }
 */
function validateTransition(currentStatus, newStatus) {
  if (!TRANSITION_MAP[currentStatus]) {
    return {
      valid: false,
      message: `Unknown current status: '${currentStatus}'`,
    };
  }

  if (TERMINAL_STATES.includes(currentStatus)) {
    return {
      valid: false,
      message: `Trip is already in terminal state '${currentStatus}'. No further transitions allowed.`,
    };
  }

  const allowedTransitions = TRANSITION_MAP[currentStatus];
  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      message: `Invalid transition from '${currentStatus}' to '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`,
      currentStatus,
      requestedStatus: newStatus,
      allowedTransitions,
    };
  }

  return { valid: true };
}

/**
 * دریافت لیست وضعیت‌های مجاز از یک وضعیت
 */
function getAllowedTransitions(status) {
  return TRANSITION_MAP[status] || [];
}

/**
 * بررسی نهایی بودن وضعیت
 */
function isTerminalStatus(status) {
  return TERMINAL_STATES.includes(status);
}

/**
 * بررسی مجاز بودن لغو توسط مسافر
 */
function canPassengerCancel(status) {
  return getAllowedTransitions(status).includes(TripStatus.CANCELLED_BY_PASSENGER);
}

/**
 * بررسی مجاز بودن لغو توسط راننده
 */
function canDriverCancel(status) {
  return getAllowedTransitions(status).includes(TripStatus.CANCELLED_BY_DRIVER);
}

/**
 * بررسی مجاز بودن شروع سفر (مسافر سوار شده)
 */
function canStartTrip(status) {
  return status === TripStatus.ARRIVED;
}

/**
 * دریافت رویداد مرتبط با وضعیت
 */
function getEventForStatus(status) {
  return STATUS_EVENTS[status] || 'TripStatusChanged';
}

/**
 * انتشار رویداد مناسب برای وضعیت جدید
 * 
 * رویداد TripCompleted شامل پکیج جامع برای ماژول‌های مالی و نظرسنجی:
 *   Wallet, Ledger, Driver Earnings, Commission, Reviews
 */
function publishTripEvent(trip, previousStatus, newStatus) {
  const eventName = getEventForStatus(newStatus);
  const baseData = {
    tripId: trip.id,
    passengerId: trip.passenger_id,
    driverId: trip.driver_id,
    previousStatus,
    currentStatus: newStatus,
    serviceType: trip.service_type,
    timestamp: new Date().toISOString(),
  };

  let eventData = baseData;

  switch (newStatus) {
    case TripStatus.COMPLETED:
      // پکیج جامع برای فعال‌سازی ماژول‌های Wallet, Ledger, Earnings, Commission, Reviews
      eventData = {
        ...baseData,
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
      };
      break;
    case TripStatus.CANCELLED_BY_PASSENGER:
    case TripStatus.CANCELLED_BY_DRIVER:
      eventData = {
        ...baseData,
        cancelReason: trip.cancel_reason,
        cancelledBy: trip.cancelled_by,
      };
      break;
    case TripStatus.ACCEPTED:
      eventData = {
        ...baseData,
        driverId: trip.driver_id,
      };
      break;
  }

  eventBus.publish(eventName, eventData);
}

module.exports = {
  ServiceType,
  ALL_SERVICE_TYPES,
  isValidServiceType,
  TripStatus,
  TERMINAL_STATES,
  TRANSITION_MAP,
  validateTransition,
  getAllowedTransitions,
  isTerminalStatus,
  canPassengerCancel,
  canDriverCancel,
  canStartTrip,
  getEventForStatus,
  publishTripEvent,
};
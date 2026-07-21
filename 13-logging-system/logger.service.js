/**
 * logger.service.js - سرویس لاگ مرکزی
 * 
 * طبق بند ۱۳ سند مادر: مدیریت خطا و لاگ
 * این سرویس به EventBus متصل می‌شود و رویدادهای سیستم را ثبت می‌کند
 * 
 * سطوح لاگ: INFO, WARNING, ERROR
 */

const eventBus = require('../01-core-system/EventBus');
const config = require('../14-config-system/server.config');

const LOG_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};

/**
 * ثبت لاگ در کنسول (بدون Hardcode - سطح لاگ از تنظیمات خوانده می‌شود)
 */
function log(level, message, data = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  };

  // فقط لاگ‌هایی با سطح بالاتر از سطح تنظیم شده نمایش داده شوند
  const configLevel = config.logging.level || 'info';
  const levelPriority = { error: 0, warning: 1, info: 2 };
  const entryPriority = levelPriority[level.toLowerCase()] || 0;
  const configPriority = levelPriority[configLevel.toLowerCase()] || 2;

  if (entryPriority <= configPriority) {
    if (level === LOG_LEVELS.ERROR) {
      console.error(JSON.stringify(logEntry));
    } else if (level === LOG_LEVELS.WARNING) {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}

/**
 * راه‌اندازی لاگر و اشتراک در رویدادهای سیستم
 */
function initialize() {
  log(LOG_LEVELS.INFO, 'Logger service initialized');

  // اشتراک در رویداد سفر ایجاد شد
  eventBus.subscribe('TripCreated', (data) => {
    log(LOG_LEVELS.INFO, 'Trip created event received', {
      tripId: data.data.tripId,
      from: data.data.from,
      to: data.data.to,
      userId: data.data.userId
    });
  });

  // اشتراک در رویداد سفر پایان یافت
  eventBus.subscribe('TripFinished', (data) => {
    log(LOG_LEVELS.INFO, 'Trip finished event received', {
      tripId: data.data.tripId
    });
  });

  // اشتراک در رویداد لغو سفر
  eventBus.subscribe('TripCancelled', (data) => {
    log(LOG_LEVELS.INFO, 'Trip cancelled event received', {
      tripId: data.data.tripId,
      userId: data.data.userId,
      driverId: data.data.driverId,
      reason: data.data.reason
    });
  });

  // اشتراک در رویداد امنیتی سفر (دکمه اضطراری)
  eventBus.subscribe('TripSecurityReported', (data) => {
    log(LOG_LEVELS.WARNING, 'Trip security reported event received', {
      tripId: data.data.tripId,
      userId: data.data.userId,
      driverId: data.data.driverId,
      reportedBy: data.data.reportedBy,
      details: data.data.details,
      status: data.data.status,
      emergencyFlag: data.data.emergencyFlag
    });
  });

  // اشتراک در رویداد پرداخت انجام شد
  eventBus.subscribe('PaymentCompleted', (data) => {
    log(LOG_LEVELS.INFO, 'Payment completed event received', {
      transactionId: data.data.transactionId,
      amount: data.data.amount
    });
  });

  // اشتراک در رویداد کیف پول شارژ شد
  eventBus.subscribe('WalletCharged', (data) => {
    log(LOG_LEVELS.INFO, 'Wallet charged event received', {
      walletId: data.data.walletId,
      amount: data.data.amount,
      balance: data.data.balance,
      transactionId: data.data.transactionId
    });
  });

  // اشتراک در رویداد برداشت از کیف پول
  eventBus.subscribe('WalletDeducted', (data) => {
    log(LOG_LEVELS.INFO, 'Wallet deducted event received', {
      walletId: data.data.walletId,
      amount: data.data.amount,
      balance: data.data.balance,
      transactionId: data.data.transactionId
    });
  });

  // اشتراک در رویداد ثبت‌نام کاربر جدید
  eventBus.subscribe('UserRegistered', (data) => {
    log(LOG_LEVELS.INFO, 'User registered event received', {
      userId: data.data.userId,
      name: data.data.name,
      phone: data.data.phone,
      role: data.data.role
    });
  });

  // اشتراک در رویداد ورود کاربر
  eventBus.subscribe('UserLoggedIn', (data) => {
    log(LOG_LEVELS.INFO, 'User logged in event received', {
      userId: data.data.userId,
      phone: data.data.phone,
      role: data.data.role
    });
  });

  log(LOG_LEVELS.INFO, 'Logger service subscribed to all events');
}

// صادر کردن توابع عمومی
module.exports = {
  log,
  initialize,
  LOG_LEVELS
};
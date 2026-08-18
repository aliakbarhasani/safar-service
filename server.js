/**
 * نقطه ورود اصلی پروژه سفر سرویس
 * 
 * طبق بند ۱۶ سند مادر، فایل اصلی سرور در پوشه 01-core-system قرار دارد.
 * این فایل صرفاً به عنوان پل (Bridge) برای سازگاری backward-compatibility عمل می‌کند.
 */

const app = require('./01-core-system/app');
const { connectDB } = require('./01-core-system/database/db');
const config = require('./14-config-system/server.config');
const logger = require('./13-logging-system/logger.service');
const { initAllDatabases } = require('./00-infrastructure/database/init-all-databases');
const { registerUserRegisteredHandler } = require('./01-core-system/handlers/UserRegisteredHandler');

const PORT = config.port;

// راه‌اندازی سیستم لاگ مرکزی (طبق بند ۱۳ سند مادر)
logger.initialize();

// راه‌اندازی رویداد ثبت‌نام برای تهیه خودکار پروفایل‌های کسب‌وکار (seller/advertiser)
registerUserRegisteredHandler();

connectDB()
  .then(async () => {
    // تهیئة تمام جداول پایگاه داده
    await initAllDatabases();
    
    app.listen(PORT, () => {
      logger.log(logger.LOG_LEVELS.INFO, `Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    logger.log(logger.LOG_LEVELS.ERROR, 'PostgreSQL connection error', { message: err.message });
    logger.log(logger.LOG_LEVELS.WARNING, 'Starting server without DB connection (read-only mode)');
    app.listen(PORT, () => {
      logger.log(logger.LOG_LEVELS.INFO, `Server is running on port ${PORT} (DB not connected)`);
    });
  });
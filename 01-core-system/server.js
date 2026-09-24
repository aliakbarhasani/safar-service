const app = require('./app');
const { connectDB } = require('./database/db');
const config = require('../14-config-system/server.config');
const logger = require('../13-logging-system/logger.service');

const isProduction = process.env.NODE_ENV === 'production';
const PORT = config.port;

// راه‌اندازی سیستم لاگ مرکزی (طبق بند ۱۳ سند مادر)
logger.initialize();

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.log(logger.LOG_LEVELS.INFO, `Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    logger.log(logger.LOG_LEVELS.ERROR, 'PostgreSQL connection error', { message: err.message });
    if (isProduction) {
      logger.log(logger.LOG_LEVELS.ERROR, 'Production startup aborted: database connection is required');
      process.exit(1);
      return;
    }
    logger.log(logger.LOG_LEVELS.WARNING, 'Starting server without DB connection (read-only mode)');
    app.listen(PORT, () => {
      logger.log(logger.LOG_LEVELS.INFO, `Server is running on port ${PORT} (DB not connected)`);
    });
  });
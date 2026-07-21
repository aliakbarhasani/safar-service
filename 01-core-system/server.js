const app = require('./app');
const { connectDB } = require('./database/db');
const config = require('../14-config-system/server.config');
const logger = require('../13-logging-system/logger.service');

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
    logger.log(logger.LOG_LEVELS.ERROR, 'MongoDB connection error', { message: err.message });
    logger.log(logger.LOG_LEVELS.WARNING, 'Starting server without DB connection (read-only mode)');
    app.listen(PORT, () => {
      logger.log(logger.LOG_LEVELS.INFO, `Server is running on port ${PORT} (DB not connected)`);
    });
  });
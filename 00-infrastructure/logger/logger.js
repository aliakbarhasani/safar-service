/**
 * logger.js - Simple logger with Correlation ID support
 *
 * Reads correlationId from AsyncLocalStorage context and attaches
 * it to every log entry for distributed tracing.
 */

const { requestContext } = require('./context');

function format(level, message, meta = {}) {
  const store = requestContext.getStore();
  const correlationId = store?.correlationId || 'no-correlation-id';
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    correlationId,
    message,
    ...meta,
  };
  return JSON.stringify(entry);
}

const logger = {
  info(message, meta) {
    console.log(format('INFO', message, meta));
  },
  warn(message, meta) {
    console.warn(format('WARN', message, meta));
  },
  error(message, meta) {
    console.error(format('ERROR', message, meta));
  },
  debug(message, meta) {
    if (process.env.LOG_DEBUG === 'true') {
      console.log(format('DEBUG', message, meta));
    }
  },
};

module.exports = logger;

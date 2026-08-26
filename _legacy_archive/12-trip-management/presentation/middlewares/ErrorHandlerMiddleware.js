const logger = require('../../infrastructure/logging/Logger');

function errorHandlerMiddleware(err, req, res, next) {
  const statusCode = err && err.statusCode ? err.statusCode : 404;
  const errorCode = err && err.code ? err.code : (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');
  const message = err && err.message ? err.message : (statusCode === 404 ? 'Route not found.' : 'An unexpected error occurred.');

  if (statusCode >= 500) {
    logger.error('Unhandled application error', {
      method: req && req.method,
      url: req && req.originalUrl,
      errorCode,
      message,
      stack: err && err.stack ? err.stack : null,
    });
  }

  const payload = {
    success: false,
    error: {
      code: errorCode,
      message,
      status: statusCode,
    },
  };

  if (process.env.NODE_ENV !== 'production' && err && err.stack) {
    payload.error.stack = err.stack;
  }

  res.status(statusCode).json(payload);
}

module.exports = errorHandlerMiddleware;

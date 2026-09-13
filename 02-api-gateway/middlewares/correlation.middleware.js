/**
 * correlation.middleware.js - Injects Correlation ID into request lifecycle
 *
 * Reads x-correlation-id header or generates a new UUID.
 * Wraps the remaining middleware chain inside AsyncLocalStorage.run()
 * so all downstream services can access the correlationId.
 */

const crypto = require('crypto');
const { requestContext } = require('../../../00-infrastructure/logger/context');

function correlationMiddleware(req, res, next) {
  const correlationId =
    req.headers['x-correlation-id'] || crypto.randomUUID();

  // Make it available on the response header for client debugging
  res.setHeader('x-correlation-id', correlationId);

  requestContext.run({ correlationId }, () => {
    next();
  });
}

module.exports = correlationMiddleware;

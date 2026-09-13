/**
 * context.js - AsyncLocalStorage for Correlation ID propagation
 * 
 * Provides a request-scoped context that survives the lifetime of
 * an async operation without passing the correlationId through every function.
 */

const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();

module.exports = { requestContext };

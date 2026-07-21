/**
 * Application Layer Index
 *
 * Aggregates and exports all application layer modules.
 *
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED | Refactored v2
 */

const useCases = require('./useCases');
const events = require('./events');

module.exports = {
  useCases,
  events,
};

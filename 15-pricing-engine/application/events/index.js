/**
 * Events Index
 *
 * Aggregates and exports all event-related modules.
 *
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED | Refactored v2
 */

const EventContract = require('./EventContract');
const PricingEvents = require('./PricingEvents');

module.exports = {
  EventContract,
  PricingEvents,
};

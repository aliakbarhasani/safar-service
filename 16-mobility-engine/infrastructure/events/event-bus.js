/**
 * event-bus.js - Mobility Engine EventBus adapter (Infrastructure Layer)
 *
 * Re-exports the central singleton EventBus (`01-core-system/EventBus`)
 * so the mobility engine publishes domain events without a direct
 * dependency on the Wallet (or any other) module. In-process pub/sub
 * via Node EventEmitter; envelope shape: { event, data, timestamp }.
 */

const eventBus = require('../../../01-core-system/EventBus');

/**
 * Publish a mobility domain event on the shared bus.
 * @param {string} event - canonical event name (see TripDomainEvents)
 * @param {Object} [data]
 */
function publishTripEvent(event, data = {}) {
  eventBus.publish(event, data);
}

module.exports = eventBus;
module.exports.publishTripEvent = publishTripEvent;
module.exports.eventBus = eventBus;

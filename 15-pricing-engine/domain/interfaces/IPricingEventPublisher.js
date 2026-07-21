/**
 * IPricingEventPublisher Interface - Event publishing contract
 *
 * Defines the contract for publishing pricing-related domain events.
 * No coupling to specific message broker technology (RabbitMQ, Kafka, EventBus).
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */

/**
 * @interface IPricingEventPublisher
 */
class IPricingEventPublisher {
  /**
   * Publish a generic pricing event
   * @param {Object} event - Standardized event envelope
   * @param {string} event.eventId - Unique event identifier
   * @param {string} event.eventType - Event type name
   * @param {Object} event.payload - Event payload data
   * @returns {Promise<void>}
   */
  async publish(event) {
    throw new Error('IPricingEventPublisher.publish() not implemented');
  }

  /**
   * Publish a quote generated event
   * @param {Object} quote - Quote snapshot data
   * @returns {Promise<void>}
   */
  async publishQuoteGenerated(quote) {
    throw new Error('IPricingEventPublisher.publishQuoteGenerated() not implemented');
  }

  /**
   * Publish a rule changed event
   * @param {Object} rule - Rule snapshot data
   * @param {string} changeType - Type of change: CREATED, UPDATED, DELETED
   * @returns {Promise<void>}
   */
  async publishRuleChanged(rule, changeType) {
    throw new Error('IPricingEventPublisher.publishRuleChanged() not implemented');
  }

  /**
   * Publish a surge pricing activated event
   * @param {Object} surgeInfo - Surge pricing details
   * @returns {Promise<void>}
   */
  async publishSurgeActivated(surgeInfo) {
    throw new Error('IPricingEventPublisher.publishSurgeActivated() not implemented');
  }
}

module.exports = IPricingEventPublisher;

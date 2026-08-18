/**
 * MockEventPublisher - Infrastructure implementation of IPricingEventPublisher
 *
 * Logs events to console instead of publishing to a message broker.
 * Used for development/testing.
 *
 * Architecture: Clean Architecture - Infrastructure Layer
 * Status: LOCKED | Created v2
 */

class MockEventPublisher {
  constructor() {
    this.events = [];
  }

  /**
   * Publish a quote generated event
   * @param {Object} quoteSnapshot
   * @returns {Promise<void>}
   */
  async publishQuoteGenerated(quoteSnapshot) {
    this.events.push({ type: 'QuoteGenerated', payload: quoteSnapshot, timestamp: new Date().toISOString() });
  }

  /**
   * Publish a generic event
   * @param {Object} event
   * @returns {Promise<void>}
   */
  async publish(event) {
    this.events.push({ ...event, timestamp: new Date().toISOString() });
  }

  /**
   * Get all published events (for test assertions)
   * @returns {Array}
   */
  getPublishedEvents() {
    return this.events;
  }

  /**
   * Clear all recorded events
   */
  clear() {
    this.events = [];
  }
}

module.exports = MockEventPublisher;
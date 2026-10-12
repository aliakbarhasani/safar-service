'use strict';

/**
 * OutboxRelay.js - Core System (P12)
 *
 * Worker for the Transactional Outbox pattern:
 * 1) fetch pending outbox rows
 * 2) publish through the central EventBus
 * 3) mark PUBLISHED only after required consumer acknowledgement
 *
 * Delivery is at-least-once; consumers must be idempotent.
 */
const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 5;
const EVENT_ID_KEY = 'eventId';
const AGGREGATE_ID_KEY = 'aggregateId';
const ACK_REQUIRED_EVENTS = new Set(['TripCompleted', 'TripCreated', 'TripCancelled']);

class OutboxRelay {
  constructor({
    outboxRepository,
    eventBus = null,
    intervalMs = DEFAULT_INTERVAL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
    maxRetries = DEFAULT_MAX_RETRIES,
    logger = console,
  } = {}) {
    if (!outboxRepository || typeof outboxRepository.fetchPending !== 'function') {
      throw new Error('OutboxRelay requires an outboxRepository with fetchPending()');
    }
    this.outboxRepository = outboxRepository;
    // Lazy require allows a fake EventBus to be injected in tests.
    // eslint-disable-next-line global-require
    this.eventBus = eventBus || require('./EventBus');
    this.intervalMs = intervalMs;
    this.batchSize = batchSize;
    this.maxRetries = maxRetries;
    this.logger = logger || console;
    this._timer = null;
    this._running = false;
    this.stats = { published: 0, failed: 0, ticks: 0 };
  }

  start() {
    if (this._timer) return this;
    this._timer = setInterval(() => { this._tick(); }, this.intervalMs);
    if (typeof this._timer.unref === 'function') this._timer.unref();
    this._tick();
    return this;
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  async _tick() {
    if (this._running) return 0;
    this._running = true;
    try {
      return await this.runOnce();
    } catch (error) {
      this.logger.error('[OutboxRelay] tick failed:', error && error.message);
      return 0;
    } finally {
      this._running = false;
    }
  }

  async runOnce() {
    const rows = await this.outboxRepository.fetchPending({ limit: this.batchSize });
    if (!rows || rows.length === 0) return 0;

    this.stats.ticks += 1;
    let published = 0;

    for (const row of rows) {
      try {
        await this._publish(row);
        await this.outboxRepository.markPublished(row.id);
        this.stats.published += 1;
        published += 1;
      } catch (error) {
        this.stats.failed += 1;
        this.logger.error(
          `[OutboxRelay] publish failed for ${row.event_type} (${row.id}):`,
          error && error.message,
        );
        // Do not abort the rest of the batch if retry recording fails.
        try {
          await this.outboxRepository.markFailed(row.id, error, { maxRetries: this.maxRetries });
        } catch (markFailedError) {
          this.logger.error(
            `[OutboxRelay] could not record failure for ${row.id}:`,
            markFailedError && markFailedError.message,
          );
        }
      }
    }
    return published;
  }

  async _publish(row) {
    const payload = (row.payload && typeof row.payload === 'object') ? row.payload : {};
    const data = {
      ...payload,
      [EVENT_ID_KEY]: row.id,
      [AGGREGATE_ID_KEY]: row.aggregate_id,
    };

    if (typeof this.eventBus.publishAsync !== 'function') {
      // A fire-and-forget publish cannot prove that financial consumers finished.
      // Keep the durable event pending for retry rather than falsely acknowledging it.
      if (ACK_REQUIRED_EVENTS.has(row.event_type)) {
        throw new Error(`Async consumer acknowledgement is required for ${row.event_type}`);
      }
      if (typeof this.eventBus.publish !== 'function') {
        throw new Error('EventBus must implement publish() or publishAsync()');
      }
      this.eventBus.publish(row.event_type, data);
      return;
    }

    const results = await this.eventBus.publishAsync(row.event_type, data);
    const acknowledgements = (Array.isArray(results) ? results : [])
      .filter((result) => result && typeof result === 'object');

    if (ACK_REQUIRED_EVENTS.has(row.event_type)) {
      const hasContractAcknowledgement = acknowledgements.some((result) => {
        if (row.event_type === 'TripCompleted') {
          return typeof result.consumed === 'boolean' || typeof result.processed === 'boolean';
        }
        if (row.event_type === 'TripCreated') {
          return typeof result.dispatchFailed === 'boolean' || typeof result.status === 'string';
        }
        if (row.event_type === 'TripCancelled') {
          return typeof result.penaltyProcessed === 'boolean' || typeof result.released === 'boolean';
        }
        return false;
      });

      if (!hasContractAcknowledgement) {
        throw new Error(`Missing consumer acknowledgement for ${row.event_type}`);
      }
    }

    const failed = acknowledgements.find((result) => {
      if (row.event_type === 'TripCompleted') return result.processed === false;
      if (row.event_type === 'TripCreated') return result.dispatchFailed === true;
      if (row.event_type === 'TripCancelled') {
        return result.penaltyProcessed === false
          || (result.released === false && result.reason !== 'no_held_amount');
      }
      return false;
    });
    if (failed) {
      throw new Error(`Consumer failed for ${row.event_type}: ${failed.reason || failed.message || 'processing failed'}`);
    }
  }
}

module.exports = OutboxRelay;
module.exports.OutboxRelay = OutboxRelay;
module.exports.EVENT_ID_KEY = EVENT_ID_KEY;
module.exports.AGGREGATE_ID_KEY = AGGREGATE_ID_KEY;

/**
 * FeedbackSubmitted.handler.js - User Profile Subscriber (P5-2)
 *
 * Listens to the `FeedbackSubmitted` domain event (published by the Feedback
 * service) and aggregates the reviewee's trust score as a moving average
 * WITHOUT scanning all rows:
 *
 *   new_rating = ((old_rating * total_reviews) + new_rating) / (total_reviews + 1)
 *
 * Both `users.rating` (DECIMAL) and `users.total_reviews` (INTEGER) are updated
 * atomically in a single UPDATE statement on the canonical profile table.
 */

const eventBus = require('../../01-core-system/EventBus');
const config = require('../../14-config-system/server.config');
const { Pool } = require('pg');

const FEEDBACK_EVENT = 'FeedbackSubmitted';

let pool = null;
function getPool() {
  if (!pool) pool = new Pool(config.pg);
  return pool;
}

/**
 * Pure moving-average math (exported for testing).
 * @param {number|null|string} oldRating
 * @param {number|null|string} totalReviews
 * @param {number} newRating
 * @returns {number}
 */
function computeNewRating(oldRating, totalReviews, newRating) {
  const old = Number(oldRating) || 0;
  const total = Number(totalReviews) || 0;
  const rating = Number(newRating) || 0;
  return ((old * total) + rating) / (total + 1);
}

class FeedbackSubmittedHandler {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.eventBus] - inject EventBus (or mock) for tests
   * @param {import('pg').Pool} [opts.pool] - inject a fake pool for tests
   */
  constructor({ eventBus: injectedBus = null, pool: injectedPool = null } = {}) {
    this.eventBus = injectedBus || eventBus;
    this.pool = injectedPool || getPool();
    this._registered = false;
    this._boundOnFeedback = (envelope) => this.handle(envelope);
  }

  /**
   * Point of entry for the event (envelope: { event, data, timestamp }).
   * Never throws back to the publisher (decoupled fire-and-forget).
   */
  async handle({ event, data } = {}) {
    try {
      const revieweeId = data && (data.revieweeId || data.reviewee_id || data.userId);
      const rating = Number(data && data.rating);
      const tripId = data && (data.tripId || data.trip_id);

      if (!revieweeId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
        return { updated: false, reason: 'missing_or_invalid', event: event || null };
      }

      const row = await this.updateTrustScore(revieweeId, rating);
      return {
        updated: true,
        revieweeId,
        rating,
        tripId,
        newRating: row ? Number(row.rating) : null,
        totalReviews: row ? Number(row.total_reviews) : null,
      };
    } catch (err) {
      console.error(`[FeedbackSubmittedHandler] failed for reviewee ${data && data.revieweeId}:`, err && err.message);
      return { updated: false, reason: 'error', message: err && err.message };
    }
  }

  /**
   * Atomic moving-average UPDATE on the users profile.
   * @param {string} revieweeId
   * @param {number} rating
   * @returns {Promise<Object|null>}
   */
  async updateTrustScore(revieweeId, rating) {
    const res = await this.pool.query(
      `UPDATE users
         SET rating = ROUND(((rating * total_reviews + $2) / (total_reviews + 1))::numeric, 2),
             total_reviews = total_reviews + 1
       WHERE id = $1
       RETURNING rating, total_reviews`,
      [revieweeId, rating],
    );
    return res.rows[0] || null;
  }

  /** Subscribe to the FeedbackSubmitted event (idempotent per instance). */
  register() {
    if (!this._registered) {
      this.eventBus.on(FEEDBACK_EVENT, this._boundOnFeedback);
      this._registered = true;
    }
    return this;
  }

  /** Unsubscribe (for cleanup / tests). */
  unregister() {
    if (this._registered) {
      this.eventBus.off(FEEDBACK_EVENT, this._boundOnFeedback);
      this._registered = false;
    }
    return this;
  }
}

/** Bootstrap helpers. */
function registerFeedbackSubmittedHandler(opts = {}) {
  return new FeedbackSubmittedHandler(opts).register();
}

module.exports = {
  FeedbackSubmittedHandler,
  registerFeedbackSubmittedHandler,
  computeNewRating,
  FEEDBACK_EVENT,
};
/**
 * review.model.js - Reviews Data Access Layer (Feedback Service)
 *
 * Postgres repository for the `reviews` table (migration 002 / 024).
 * Provides duplicate-origin checks and inserts. The UNIQUE constraint
 * `uq_reviews_trip_reviewer_reviewee` guarantees a reviewer cannot rate the
 * same trip twice, even under concurrency (violation code 23505 handled here).
 */

const { getPool } = require('../infrastructure/db');

class ReviewRepository {
  /**
   * @param {import('pg').Pool} [pool]
   */
  constructor(pool = null) {
    this.pool = pool || getPool();
  }

  /**
   * Find an existing (non-deleted) review for a given trip + reviewer.
   * @returns {Promise<Object|null>}
   */
  async findByTripAndReviewer(tripId, reviewerId) {
    const res = await this.pool.query(
      `SELECT * FROM reviews
       WHERE trip_id = $1 AND reviewer_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [tripId, reviewerId],
    );
    return res.rows[0] || null;
  }

  /**
   * Insert a new review.
   * @param {Object} review { tripId, reviewerId, revieweeId, rating, comment }
   * @returns {Promise<Object>} inserted row
   */
  async create({ tripId, reviewerId, revieweeId, rating, comment = null }) {
    const res = await this.pool.query(
      `INSERT INTO reviews (trip_id, reviewer_id, reviewee_id, entity_type, rating, comment)
       VALUES ($1, $2, $3, 'trip', $4, $5)
       RETURNING *`,
      [tripId, reviewerId, revieweeId, rating, comment],
    );
    return res.rows[0];
  }

  /** Fetch all reviews for a trip (useful for listing). */
  async findByTrip(tripId) {
    const res = await this.pool.query(
      `SELECT * FROM reviews WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [tripId],
    );
    return res.rows;
  }

  /** Fetch all reviews received by a given user. */
  async findByReviewee(revieweeId) {
    const res = await this.pool.query(
      `SELECT * FROM reviews WHERE reviewee_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [revieweeId],
    );
    return res.rows;
  }
}

/**
 * Map a unique-violation (code 23505) into a typed duplicate-review error.
 */
ReviewRepository.isDuplicateError = function isDuplicateReviewError(err) {
  return !!err && err.code === '23505';
};

module.exports = { ReviewRepository };
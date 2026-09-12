/**
 * TripLookup.js - Trip read-gateway (Infrastructure, Feedback Service)
 *
 * Read-only access to the `trips` table so SubmitReviewUseCase can verify:
 *   1. the trip exists,
 *   2. it is COMPLETED (lifecycle_status = 'COMPLETED'),
 *   3. the reviewer is a participant (passenger_id or driver_id) of that trip.
 *
 * Keeps the feedback bounded-context from mutating mobility data.
 */

const { getPool } = require('../infrastructure/db');

class TripLookup {
  /**
   * @param {import('pg').Pool} [pool]
   */
  constructor(pool = null) {
    this.pool = pool || getPool();
  }

  /**
   * Fetch a trip's membership + lifecycle status by id.
   * @returns {Promise<Object|null>} row with passenger_id, driver_id,
   *          lifecycle_status (canonical) and status (legacy).
   */
  async getById(tripId) {
    const res = await this.pool.query(
      `SELECT id, passenger_id, driver_id, lifecycle_status, status
       FROM trips WHERE id = $1`,
      [tripId],
    );
    return res.rows[0] || null;
  }
}

module.exports = { TripLookup };
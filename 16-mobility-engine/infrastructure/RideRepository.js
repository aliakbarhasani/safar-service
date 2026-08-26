/**
 * RideRepository - Infrastructure Layer (Ride Engine)
 *
 * Persists rides and ride status-change logs to PostgreSQL.
 * `createRide` and `logStatusChange` are designed to be executed inside a
 * caller-managed transaction (they accept a `client`).
 */

const { RideNotFoundError } = require('../domain/errors/RideErrors');

class RideRepository {
    constructor(dbClient) {
        this.db = dbClient;
    }

    /**
     * Inserts a ride row inside the provided transaction client.
     * @param {Object} rideData - output of Ride.toDatabaseRecord()
     * @param {import('pg').PoolClient} client - transaction client
     * @returns {Promise<Object>} full inserted row
     */
    async createRide(rideData, client) {
        const query = `
            INSERT INTO rides (
                id, passenger_id, driver_id, quote_id, status,
                origin_lat, origin_lng, dest_lat, dest_lng
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4,
                $5, $6, $7, $8
            ) RETURNING id, passenger_id, driver_id, quote_id, status,
                        origin_lat, origin_lng, dest_lat, dest_lng,
                        created_at, updated_at
        `;
        const values = [
            rideData.passenger_id,
            rideData.driver_id || null,
            rideData.quote_id,
            rideData.status,
            rideData.origin_lat,
            rideData.origin_lng,
            rideData.dest_lat,
            rideData.dest_lng,
        ];
        const result = await client.query(query, values);
        return result.rows[0];
    }

    /**
     * Inserts a status-change log row inside the provided transaction client.
     * @param {Object} params
     * @param {string} params.rideId
     * @param {string|null} params.oldStatus
     * @param {string} params.newStatus
     * @param {string} params.changedByUserId
     * @param {Object} client - transaction client
     */
    async logStatusChange({ rideId, oldStatus, newStatus, changedByUserId }, client) {
        const query = `
            INSERT INTO ride_status_logs (ride_id, old_status, new_status, changed_by_user_id)
            VALUES ($1, $2, $3, $4)
        `;
        await client.query(query, [rideId, oldStatus || null, newStatus, changedByUserId]);
    }

    /**
     * Fetches a ride by id, locking the row for update (concurrency-safe) inside
     * the provided transaction client. Returns null when not found.
     * @param {string} rideId
     * @param {import('pg').PoolClient} client - transaction client
     * @returns {Promise<Object|null>} ride row
     */
    async getRideByIdForUpdate(rideId, client) {
        const query = `
            SELECT id, passenger_id, driver_id, quote_id, status,
                   origin_lat, origin_lng, dest_lat, dest_lng,
                   created_at, updated_at
            FROM rides
            WHERE id = $1
            FOR UPDATE
        `;
        const result = await client.query(query, [rideId]);
        if (result.rows.length === 0) {
            return null;
        }
        return result.rows[0];
    }

    /**
     * Updates a ride row (e.g. status / driver_id) inside the provided
     * transaction client, and logs the status change.
     * @param {Object} params
     * @param {string} params.rideId
     * @param {string} params.status
     * @param {string|null} params.driverId
     * @param {Object} client - transaction client
     * @returns {Promise<Object>} updated ride row
     */
    async updateRideStatus({ rideId, status, driverId }, client) {
        const query = `
            UPDATE rides
            SET status = $2,
                driver_id = COALESCE($3, driver_id),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, passenger_id, driver_id, quote_id, status,
                      origin_lat, origin_lng, dest_lat, dest_lng,
                      created_at, updated_at
        `;
        const result = await client.query(query, [rideId, status, driverId || null]);
        return result.rows[0];
    }

    /**
     * Fetches a ride by id along with its latest status.
     * @param {string} rideId
     * @returns {Promise<Object|null>} ride row (or null)
     */
    async getRideById(rideId) {
        const query = `
            SELECT id, passenger_id, driver_id, quote_id, status,
                   origin_lat, origin_lng, dest_lat, dest_lng,
                   created_at, updated_at
            FROM rides
            WHERE id = $1
        `;
        const result = await this.db.query(query, [rideId]);
        if (result.rows.length === 0) {
            return null;
        }
        return result.rows[0];
    }
}

module.exports = RideRepository;
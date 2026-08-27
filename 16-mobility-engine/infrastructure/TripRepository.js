/**
 * TripRepository - Infrastructure Layer (Mobility Engine)
 *
 * Persists unified trips to the canonical `trips` / `trip_timeline` tables
 * (migration 001 schema, enriched by migration 020).
 *
 * Two status representations are kept in sync on every write:
 *   - `lifecycle_status` (VARCHAR): the EXACT domain state (UPPERCASE,
 *     e.g. CANCELLED_BY_DRIVER) - added by migration 020; the single
 *     source of truth read back by this repository.
 *   - `status` / `trip_phase` (DB enum `trip_status`, lowercase): the
 *     nearest legacy enum value for pre-020 consumers.
 *
 * All mutating methods accept a transaction `client` so use cases can run
 * them inside the same transaction as the atomic quote consumption.
 */

const LEGACY_STATUS_MAP = Object.freeze({
    REQUESTED: 'requested',
    SEARCHING: 'requested',
    ACCEPTED: 'driver_assigned',
    ARRIVED: 'driver_arrived',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'finished',
    CANCELLED: 'cancelled',
    CANCELLED_BY_PASSENGER: 'cancelled',
    CANCELLED_BY_DRIVER: 'cancelled',
    EXPIRED: 'cancelled',
});

const SELECT_COLUMNS = `
            id,
            passenger_id,
            driver_id,
            quote_id,
            lifecycle_status AS status,
            service_type,
            origin_address,
            origin_latitude  AS origin_lat,
            origin_longitude AS origin_lng,
            destination_address,
            destination_latitude  AS dest_lat,
            destination_longitude AS dest_lng,
            payment_method,
            currency_id,
            estimated_cost,
            final_cost,
            base_fare,
            commission_rate,
            commission_amount,
            driver_earning,
            country_id,
            cancel_reason,
            cancelled_by,
            started_at,
            finished_at,
            version,
            created_at,
            updated_at
`;

class TripRepository {
    constructor(dbClient) {
        this.db = dbClient;
    }

    /**
     * Inserts a trip row inside the provided transaction client.
     * @param {Object} record - output of Trip.toDatabaseRecord()
     * @param {import('pg').PoolClient} client - transaction client
     * @returns {Promise<Object>} inserted row (canonical select shape)
     */
    async createTrip(record, client) {
        const query = `
            INSERT INTO trips (
                passenger_id, driver_id, quote_id,
                lifecycle_status, status, trip_phase,
                service_type,
                origin_address, origin_latitude, origin_longitude,
                destination_address, destination_latitude, destination_longitude,
                payment_method,
                estimated_cost, final_cost, commission_amount, driver_earning,
                country_id
            ) VALUES (
                $1, $2, $3,
                $4, $5, $5,
                $6,
                $7, $8, $9,
                $10, $11, $12,
                COALESCE($13::trip_payment_method, 'wallet'),
                COALESCE($14, 0), COALESCE($15, 0),
                COALESCE($16, 0), COALESCE($17, 0),
                $18
            )
            RETURNING ${SELECT_COLUMNS}
        `;
        const values = [
            record.passenger_id,
            record.driver_id || null,
            record.quote_id || null,
            record.status,
            LEGACY_STATUS_MAP[record.status] || 'cancelled',
            record.service_type || 'urban_taxi',
            record.origin_address || '',
            record.origin_lat ?? null,
            record.origin_lng ?? null,
            record.destination_address || '',
            record.dest_lat ?? null,
            record.dest_lng ?? null,
            record.payment_method || null,
            record.estimated_cost ?? null,
            record.final_cost ?? null,
            record.commission_amount ?? null,
            record.driver_earning ?? null,
            record.country_id || null,
        ];
        const result = await client.query(query, values);
        return result.rows[0];
    }

    /**
     * Inserts a status-change row into `trip_timeline` inside the provided
     * transaction client.
     * @param {Object} params
     * @param {string} params.tripId
     * @param {string|null} params.oldStatus - exact domain state
     * @param {string} params.newStatus - exact domain state
     * @param {string|null} params.changedByUserId
     * @param {string|null} [params.changedByRole] - 'passenger' | 'driver' | ...
     * @param {string|null} [params.reason]
     * @param {import('pg').PoolClient} client - transaction client
     */
    async logStatusChange(
        { tripId, oldStatus, newStatus, changedByUserId, changedByRole = null, reason = null },
        client,
    ) {
        const query = `
            INSERT INTO trip_timeline (
                trip_id, previous_status, new_status, changed_by, changed_by_role, reason
            )
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(query, [
            tripId,
            oldStatus || null,
            newStatus,
            changedByUserId || null,
            changedByRole || null,
            reason || null,
        ]);
    }

    /**
     * Fetches a trip by id, locking the row for update (concurrency-safe).
     * Returns null when not found.
     * @param {import('pg').PoolClient} client - transaction client
     */
    async getTripByIdForUpdate(tripId, client) {
        const query = `SELECT ${SELECT_COLUMNS} FROM trips WHERE id = $1 FOR UPDATE`;
        const result = await client.query(query, [tripId]);
        return result.rows.length === 0 ? null : result.rows[0];
    }

    /**
     * Updates a trip's status (exact domain state + legacy enum mirror) and
     * optionally the driver / cancellation metadata, inside the provided
     * transaction client.
     * @param {Object} params
     * @param {string} params.tripId
     * @param {string} params.status - exact domain state (UPPERCASE)
     * @param {string|null} [params.driverId]
     * @param {string|null} [params.cancelReason]
     * @param {string|null} [params.cancelledBy] - 'user' | 'driver' | 'system' | 'support'
     * @param {import('pg').PoolClient} client - transaction client
     */
    async updateTripStatus(
        { tripId, status, driverId, cancelReason = null, cancelledBy = null },
        client,
    ) {
        const query = `
            UPDATE trips
            SET lifecycle_status = $2,
                status           = $3,
                trip_phase       = $3,
                driver_id        = COALESCE($4, driver_id),
                cancel_reason    = COALESCE($5, cancel_reason),
                cancelled_by     = COALESCE($6, cancelled_by),
                updated_at       = NOW()
            WHERE id = $1
            RETURNING ${SELECT_COLUMNS}
        `;
        const legacy = LEGACY_STATUS_MAP[status] || 'cancelled';
        const result = await client.query(query, [
            tripId,
            status,
            legacy,
            driverId || null,
            cancelReason,
            cancelledBy,
        ]);
        return result.rows[0];
    }

    /**
     * Fetches a trip by id along with its exact current lifecycle status.
     * @returns {Promise<Object|null>} trip row (or null when not found)
     */
    async getTripById(tripId) {
        const query = `SELECT ${SELECT_COLUMNS} FROM trips WHERE id = $1`;
        const result = await this.db.query(query, [tripId]);
        return result.rows.length === 0 ? null : result.rows[0];
    }
}

module.exports = TripRepository;
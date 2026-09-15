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

const { TripNotFoundError, TripAlreadyAcceptedError } = require('../domain/errors/RideErrors');
// StateConflictError: نام مستعار معنایی برای تعارض وضعیت (409) — همان
// TripAlreadyAcceptedError است تا قرارداد خواسته‌شده مرحله P2-2 برقرار باشد.
const StateConflictError = TripAlreadyAcceptedError;

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
    constructor(dbClient, { outboxRepository = null } = {}) {
        this.db = dbClient;
        // (P12/P13-2) اختیاری: ثبت رویداد در Outbox داخل همان تراکنش وضعیت سفر
        this.outboxRepository = outboxRepository;
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
        { tripId, status, driverId, cancelReason = null, cancelledBy = null, finalCost = null },
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
                final_cost       = COALESCE($7, final_cost),
                finished_at      = CASE WHEN $3 = 'finished' THEN COALESCE(finished_at, NOW()) ELSE finished_at END,
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
            finalCost ?? null,
        ]);
        return result.rows[0];
    }

    /**
     * قفل کردن سفر پس از شروع تراکنش بیرونی (concurrency-safe read).
     * @param {string} tripId
     * @param {import('pg').PoolClient} client - تراکنش جاری (BEGIN قبلاً اجرا شده)
     * @returns {Promise<Object>} ردیف سفر (شکل canonical)
     * @throws {TripStateNotFoundError} وقتی سفر وجود ندارد
     */
    async lockTripForUpdate(tripId, client) {
        const query = `SELECT id, lifecycle_status AS status, driver_id, passenger_id FROM trips WHERE id = $1 FOR UPDATE`;
        const result = await client.query(query, [tripId]);
        if (result.rows.length === 0) {
            throw new TripNotFoundError(tripId);
        }
        return result.rows[0];
    }

    /**
     * تغییر وضعیت اتمیک سفر با قفل ردیفی (P2-2).
     *
     * از تداخل پذیرش همزمان یک سفر توسط چند راننده جلوگیری می‌کند:
     *   1. تراکنش را باز می‌کند (BEGIN) — این متد مالک lifecycle تراکنش است،
     *   2. سفر را با `SELECT ... FOR UPDATE` قفل می‌کند،
     *   3. اگر وضعیت فعلی برابر `expectedState` نباشد، ROLLBACK کرده و
     *      خطای `TripAlreadyAcceptedError` (نام مستعار StateConflictError) می‌اندازد،
     *   4. در صورت تطابق، وضعیت را به `targetState` برده، driver_id را ست می‌کند،
     *      ردیف timeline را می‌نویسد و COMMIT می‌کند.
     *
     * @param {Object} params
     * @param {string} params.tripId
     * @param {string} params.expectedState - وضعیت موردانتظار (مثلاً 'SEARCHING')
     * @param {string} params.targetState - وضعیت هدف (مثلاً 'ACCEPTED')
     * @param {string|null} [params.driverId] - شناسه راننده پذیرنده
     * @param {string|null} [params.changedByUserId] - فاعل تغییر (ثبت timeline)
     * @param {string} [params.changedByRole='driver']
     * @param {string} [params.reason='trip_state_changed']
     * @returns {Promise<Object>} ردیف به‌روزشده سفر (شکل canonical)
     * @throws {TripNotFoundError} وقتی سفر وجود ندارد (404)
     * @throws {TripAlreadyAcceptedError} وقتی وضعیت فعلی با expectedState فرق دارد (409)
     */
    async updateTripStateAtomic({
        tripId,
        expectedState,
        targetState,
        driverId = null,
        changedByUserId = null,
        changedByRole = 'driver',
        reason = 'trip_state_changed',
        outboxEvent = null,
    }) {
        if (!tripId || !expectedState || !targetState) {
            const error = new Error('پارامترهای tripId، expectedState و targetState الزامی هستند.');
            error.code = 'TRIP_ATOMIC_UPDATE_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            // ۱) خواندن با قفل ردیفی — ردیف تا پایان تراکنش قفل می‌ماند
            const locked = await this.lockTripForUpdate(tripId, client);

            // ۲) تطبیق وضعیت موردانتظار؛ در صورت عدم تطابق ROLLBACK + خطای تعارض
            if (locked.status !== expectedState) {
                await client.query('ROLLBACK');
                throw new TripAlreadyAcceptedError(tripId);
            }

            // ۳) به‌روزرسانی وضعیت + تنظیم راننده و ثبت timeline
            const updated = await this.updateTripStatus(
                { tripId, status: targetState, driverId },
                client,
            );
            await this.logStatusChange(
                {
                    tripId,
                    oldStatus: expectedState,
                    newStatus: targetState,
                    changedByUserId: changedByUserId || driverId,
                    changedByRole,
                    reason,
                },
                client,
            );

            // ۴) (P13-2 + P12) ثبت رویداد در Outbox داخل «همان تراکنش»:
            // اگر این درج شکست بخورد، تغییر وضعیت نیز ROLLBACK می‌شود؛ بنابراین
            // هرگز رویدادی بدون تغییر وضعیت (یا برعکس) در سیستم ثبت نمی‌شود.
            if (outboxEvent) {
                if (!this.outboxRepository) {
                    const error = new Error('TripRepository: برای ثبت outboxEvent باید outboxRepository تزریق شده باشد.');
                    error.code = 'OUTBOX_REPOSITORY_MISSING';
                    throw error;
                }
                await this.outboxRepository.insert(outboxEvent, client);
            }

            await client.query('COMMIT');
            return updated;
        } catch (error) {
            // وقتی خطا از عدم تطابق وضعیت باشد، ROLLBACK قبلاً اجرا شده؛
            // اجرای دوباره آن را نادیده می‌گیریم (تراکنش دیگر فعالی نیست).
            if (error && error.code === 'TRIP_ALREADY_ACCEPTED') {
                throw error;
            }
            try {
                await client.query('ROLLBACK');
            } catch (_) {
                // نادیده گرفتن — تراکنش ممکن است قبلاً بسته شده باشد
            }
            throw error;
        } finally {
            client.release();
        }
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
module.exports.StateConflictError = StateConflictError;
module.exports.TripAlreadyAcceptedError = TripAlreadyAcceptedError;
module.exports.TripNotFoundError = TripNotFoundError;
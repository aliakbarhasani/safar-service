/**
 * EndTripUseCase - Application Layer (Mobility Engine)
 *
 * The trip finishes (IN_PROGRESS -> COMPLETED) and the final fare is
 * resolved. Runs inside a single DB transaction with row-level locking
 * (SELECT ... FOR UPDATE). After commit it emits `TripCompleted` carrying the
 * settlement payload { tripId, passengerId, driverId, amount, currency }
 * that the Wallet `TripCompleted` subscriber consumes to process the
 * passenger payment / driver revenue / platform commission.
 *
 * Fare resolution (P5-1, intentionally simple for now):
 *   1. use an explicit `finalFare` input if provided, else
 *   2. use the quote's `estimated_cost` when available, else
 *   3. compute a simple distance-based fare = haversineKm * perKmRate,
 *      clamped to the trip's `defaultCost`.
 */

const Trip = require('../domain/models/Trip');
const { TripNotFoundError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');
const config = require('../../14-config-system/server.config');

/** Haversine distance in kilometres between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

class EndTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {Function} [deps.emitEvent]
     */
    constructor({ tripRepository, emitEvent = null }) {
        this.tripRepository = tripRepository;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    }

    execute({ tripId, changedByUserId = null, finalFare = null }) {
        if (!tripId) {
            const error = new Error('پارامتر tripId الزامی است.');
            error.code = 'END_TRIP_VALIDATION';
            error.statusCode = 400;
            throw error;
        }

        return (async () => {
            const db = this.tripRepository.db;
            const client = await db.connect();
            try {
                await client.query('BEGIN');

                // الف) واکشی سفر با قفل ردیف (همزمانی ایمن)
                const row = await this.tripRepository.getTripByIdForUpdate(tripId, client);
                if (!row) {
                    throw new TripNotFoundError(tripId);
                }

                // ب) گذار دامنه: IN_PROGRESS -> COMPLETED
                const trip = new Trip({ id: row.id, status: row.status });
                trip.complete(); // throws InvalidRideStateTransitionError on invalid

                // ج) تعیین کرایه نهایی
                const fare = this._resolveFare(finalFare, row);
                trip.finalCost = fare;

                // د) بهروزرسانی وضعیت + کرایه نهایی و ثبت timeline
                const updated = await this.tripRepository.updateTripStatus(
                    { tripId, status: trip.status, finalCost: fare },
                    client,
                );
                const actorId = changedByUserId || row.driver_id || row.passenger_id;
                await this.tripRepository.logStatusChange(
                    {
                        tripId,
                        oldStatus: row.status,
                        newStatus: trip.status,
                        changedByUserId: actorId,
                        changedByRole: 'driver',
                        reason: 'trip_completed',
                    },
                    client,
                );

                await client.query('COMMIT');

                const currency = updated.currency_id || 'IRT';
                // هـ) انتشار رویداد دامنه پس از Commit (مصرف توسط Wallet)
                this.emitEvent(TripDomainEvents.TripCompleted, {
                    tripId,
                    passengerId: updated.passenger_id,
                    driverId: updated.driver_id,
                    amount: fare,
                    currency,
                });

                return {
                    tripId: updated.id,
                    status: updated.status,
                    driverId: updated.driver_id,
                    passengerId: updated.passenger_id,
                    finalCost: fare,
                    amount: fare,
                    currency,
                };
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    /** Fare fallback chain: input -> estimated_cost -> distance-based simple calc. */
    _resolveFare(finalFare, row) {
        if (finalFare != null && Number(finalFare) > 0) {
            return Math.round(Number(finalFare));
        }
        if (row.estimated_cost && Number(row.estimated_cost) > 0) {
            return Math.round(Number(row.estimated_cost));
        }
        const perKmRate = parseFloat((config.trip || {}).perKmRate) || 2000;
        const km = haversineKm(row.origin_lat, row.origin_lng, row.dest_lat, row.dest_lng);
        const computed = Math.round(km * perKmRate);
        const floor = parseInt((config.trip || {}).defaultCost, 10) || 0;
        return Math.max(computed, floor);
    }
}

module.exports = EndTripUseCase;
module.exports.haversineKm = haversineKm;
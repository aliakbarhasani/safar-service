/**
 * CancelTripUseCase - Application Layer (Mobility Engine)
 *
 * Role-aware cancellation (logic transferred from 06-trip-service):
 *   - role 'driver'   -> CANCELLED_BY_DRIVER
 *   - anything else
 *     (passenger/admin/system - default) -> CANCELLED_BY_PASSENGER
 *
 * Allowed from REQUESTED / SEARCHING / ACCEPTED / ARRIVED.
 * Runs inside a single DB transaction with row-level locking
 * (SELECT ... FOR UPDATE). The domain Trip state machine enforces the
 * transition; the CANCELLED domain event is emitted after commit.
 */

const Trip = require('../domain/models/Trip');
const { isValidRole } = require('../../01-core-system/constants/Roles');
const { TripNotFoundError } = require('../domain/errors/RideErrors');
const { TripDomainEvents } = require('../domain/events/TripDomainEvents');

const CANCELLATION_ROLES = ['passenger', 'driver', 'admin', 'system'];

class CancelTripUseCase {
    /**
     * @param {Object} deps
     * @param {import('../infrastructure/TripRepository')} deps.tripRepository
     * @param {Function} [deps.emitEvent]
     */
    constructor({ tripRepository, emitEvent = null }) {
        this.tripRepository = tripRepository;
        this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
    }

    async execute({ tripId, cancelledByRole = 'passenger', cancelledByUserId = null, reason = null }) {
        if (!tripId) {
            const error = new Error('پارامتر tripId الزامی است.');
            error.code = 'CANCEL_TRIP_VALIDATION';
            error.statusCode = 400;
            throw error;
        }
        const role = CANCELLATION_ROLES.includes(cancelledByRole) ? cancelledByRole : 'passenger';
        if (!isValidRole(role)) {
            const error = new Error(`نقش نامعتبر است: ${role}`);
            error.code = 'CANCEL_TRIP_ROLE_INVALID';
            error.statusCode = 400;
            throw error;
        }

        const db = this.tripRepository.db;
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // الف) واکشی سفر با قفل ردیف (همزمانی ایمن)
            const row = await this.tripRepository.getTripByIdForUpdate(tripId, client);
            if (!row) {
                throw new TripNotFoundError(tripId);
            }

            // ب) لغو آگاه از نقش (State Machine دامنه)
            const trip = new Trip({ id: row.id, status: row.status });
            trip.cancelByRole(role, reason); // -> CANCELLED_BY_PASSENGER | CANCELLED_BY_DRIVER

            // ج) بهروزرسانی رکورد + ثبت timeline (در همان تراکنش)
            const updated = await this.tripRepository.updateTripStatus(
                {
                    tripId,
                    status: trip.status,
                    driverId: null,
                    cancelReason: trip.cancelReason,
                    cancelledBy: role,
                },
                client,
            );
            const actorId = cancelledByUserId || row.passenger_id || row.driver_id;
            await this.tripRepository.logStatusChange(
                {
                    tripId,
                    oldStatus: row.status,
                    newStatus: trip.status,
                    changedByUserId: actorId,
                    changedByRole: role,
                    reason: reason || `cancelled_by_${role}`,
                },
                client,
            );

            await client.query('COMMIT');

            // د) انتشار رویداد دامنه پس از Commit
            this.emitEvent(role === 'driver' ? TripDomainEvents.TripCancelledByDriver : TripDomainEvents.TripCancelledByPassenger, {
                tripId,
                status: trip.status,
                role,
                passengerId: updated.passenger_id,
                driverId: updated.driver_id,
                reason: trip.cancelReason,
            });

            return {
                tripId: updated.id,
                status: updated.status,           // exact domain state (UPPERCASE)
                previousStatus: row.status,
                cancelledByRole: role,
                cancelReason: updated.cancel_reason,
                passengerId: updated.passenger_id,
                driverId: updated.driver_id,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = CancelTripUseCase;
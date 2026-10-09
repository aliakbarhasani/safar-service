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
const config = require('../../14-config-system/server.config');
const { TripNotFoundError, UnauthorizedTripCancelError } = require('../domain/errors/RideErrors');
const TripDomainEvents = require('../domain/events/TripDomainEvents');

const CANCELLATION_ROLES = ['passenger', 'driver', 'admin', 'system'];
// قوانین کسبوکار (P7-1): فقط این وضعیتها قابل لغو هستند
// (IN_PROGRESS لغو نمیشود — پایان مییابد یا با پشتیبانی تماس گرفته میشود).
const CANCELLABLE_STATUSES = ['REQUESTED', 'SEARCHING', 'ACCEPTED', 'ARRIVED'];
// وضعیتهای مشمول جریمه مسافر (راننده وقت گذاشته یا رسیده است).
const PENALTY_STATUSES = ['ACCEPTED', 'ARRIVED'];

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

            // ب) قوانین کسبوکار: وضعیت باید قابل لغو باشد (P7-1)
            if (!CANCELLABLE_STATUSES.includes(row.status)) {
                const error = new Error(
                    `سفر در وضعیت ${row.status} قابل لغو نیست (فقط REQUESTED / ACCEPTED / ARRIVED).`
                );
                error.code = 'TRIP_NOT_CANCELLABLE';
                error.statusCode = 409;
                error.status = row.status;
                throw error;
            }

            // ج) مالکیت: شناسه الزامی است و هر نقش فقط مالکیت مربوط به خودش را بررسی می‌کند.
            // مدیر/سیستم مستثنی هستند؛ مسافر و راننده بدون هویت معتبر fail-closed می‌شوند.
            const passengerId = row.passenger_id || null;
            const driverId = row.driver_id || null;
            if (role === 'passenger' || role === 'driver') {
                if (!cancelledByUserId) {
                    throw new UnauthorizedTripCancelError(tripId, null);
                }
                const expectedOwnerId = role === 'passenger' ? passengerId : driverId;
                if (!expectedOwnerId || String(cancelledByUserId) !== String(expectedOwnerId)) {
                    throw new UnauthorizedTripCancelError(tripId, cancelledByUserId);
                }
            }

            // ه) لغو آگاه از نقش (State Machine دامنه)
            const trip = new Trip({ id: row.id, status: row.status });
            trip.cancelByRole(role, reason); // -> CANCELLED_BY_PASSENGER | CANCELLED_BY_DRIVER

            // و) جریمه لغو: مسافر در ACCEPTED/ARRIVED جریمه میشود (baseFare از Config)
            const baseFare = parseInt((config.trip || {}).baseFare, 10) || 0;
            const penaltyAmount = (role === 'passenger' && PENALTY_STATUSES.includes(row.status))
                ? baseFare
                : 0;

            // ز) بهروزرسانی رکورد + ثبت timeline (در همان تراکنش)
            const updated = await this.tripRepository.updateTripStatus(
                {
                    tripId,
                    status: trip.status,
                    driverId: null,
                    cancelReason: trip.cancelReason,
                    // The legacy `trips.cancelled_by` constraint uses `user`
                    // for passenger-side cancellations; lifecycle_status keeps
                    // the richer canonical domain value.
                    cancelledBy: role === 'passenger' ? 'user' : role,
                },
                client,
            );
            const actorId = cancelledByUserId || passengerId || driverId;
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

            // ثبت پایدار رویداد لغو در همان تراکنش تغییر وضعیت سفر.
            if (this.tripRepository.outboxRepository) {
                await this.tripRepository.outboxRepository.insert({
                    aggregateId: String(tripId),
                    eventType: TripDomainEvents.TripCancelled,
                    payload: {
                        tripId: String(tripId),
                        cancelledBy: cancelledByUserId || passengerId,
                        role,
                        penaltyAmount,
                        driverId,
                        passengerId,
                        reason: trip.cancelReason,
                    },
                }, client);
            }

            await client.query('COMMIT');

            // د) انتشار رویداد کانونیک TripCancelled (با جریمه) پس از Commit
            this.emitEvent(TripDomainEvents.TripCancelled, {
                tripId,
                cancelledBy: cancelledByUserId || passengerId,
                role,
                penaltyAmount,
                driverId,
                passengerId,
                reason: trip.cancelReason,
            });
            // رویدادهای قدیمی برای سازگاری عقب (releaseHold/P2-1 و ...)
            this.emitEvent(role === 'driver' ? TripDomainEvents.TripCancelledByDriver : TripDomainEvents.TripCancelledByPassenger, {
                tripId,
                status: trip.status,
                role,
                passengerId,
                driverId,
                reason: trip.cancelReason,
            });

            return {
                tripId: updated.id,
                status: updated.status,           // exact domain state (UPPERCASE)
                previousStatus: row.status,
                cancelledByRole: role,
                cancelledByUserId: actorId,
                penaltyAmount,
                cancelReason: updated.cancel_reason,
                passengerId,
                driverId,
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

/**
 * RideErrors - Domain Layer (Ride Engine)
 *
 * Typed domain errors for ride state-machine violations and not-found cases.
 */

class InvalidRideStateTransitionError extends Error {
    constructor(fromStatus, toAction, expectedStatus) {
        const message = expectedStatus
            ? `انتقال نامعتبر از وضعیت ${fromStatus} برای عملیات ${toAction}؛ وضعیت موردنیاز ${expectedStatus} است.`
            : `انتقال نامعتبر از وضعیت ${fromStatus} برای عملیات ${toAction}.`;
        super(message);
        this.name = 'InvalidRideStateTransitionError';
        this.code = 'INVALID_RIDE_STATE_TRANSITION';
        this.fromStatus = fromStatus;
        this.toAction = toAction;
        this.expectedStatus = expectedStatus || null;
        this.statusCode = 409;
    }
}

class RideNotFoundError extends Error {
    constructor(rideId) {
        super(`سفری با شناسه ${rideId} یافت نشد.`);
        this.name = 'RideNotFoundError';
        this.rideId = rideId;
        this.code = 'RIDE_NOT_FOUND';
        this.statusCode = 404;
    }
}

class RideAlreadyAcceptedError extends Error {
    constructor(rideId) {
        super(`سفر ${rideId} قبلاً توسط یک راننده پذیرفته شده است.`);
        this.name = 'RideAlreadyAcceptedError';
        this.rideId = rideId;
        this.code = 'RIDE_ALREADY_ACCEPTED';
        this.statusCode = 409;
    }
}

class InvalidRideStateError extends Error {
    constructor(status, expectedStatus) {
        super(`وضعیت فعلی سفر (${status}) اجازه‌ی این عملیات را نمی‌دهد؛ وضعیت موردنیاز ${expectedStatus} است.`);
        this.name = 'InvalidRideStateError';
        this.code = 'INVALID_RIDE_STATE';
        this.statusCode = 400;
        this.status = status;
        this.expectedStatus = expectedStatus;
    }
}

module.exports = {
    InvalidRideStateTransitionError,
    RideNotFoundError,
    RideAlreadyAcceptedError,
    InvalidRideStateError,
    // Canonical mobility-engine aliases (phase 2 consolidation)
    TripNotFoundError: RideNotFoundError,
    TripAlreadyAcceptedError: RideAlreadyAcceptedError,
};
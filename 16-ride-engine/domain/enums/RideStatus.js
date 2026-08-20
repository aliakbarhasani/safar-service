/**
 * RideStatus - Domain Layer (Ride Engine)
 *
 * Allowed ride lifecycle states. This is the single source of truth for the
 * state machine; the DB CHECK constraint mirrors this exact list.
 */

const RideStatus = Object.freeze({
    REQUESTED: 'REQUESTED',
    SEARCHING: 'SEARCHING',
    ACCEPTED: 'ACCEPTED',
    ARRIVED: 'ARRIVED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
});

/**
 * Returns true when the provided value is one of the allowed ride states.
 * @param {string} value
 * @returns {boolean}
 */
function isValidRideStatus(value) {
    return Object.values(RideStatus).includes(value);
}

module.exports = RideStatus;
module.exports.isValidRideStatus = isValidRideStatus;
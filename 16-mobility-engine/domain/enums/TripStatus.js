/**
 * TripStatus - Domain Layer (Mobility Engine)
 *
 * The unified 9-state lifecycle for a mobility trip. This is the single source
 * of truth for the state machine. The DB CHECK constraint mirrors this list.
 *
 * Expanded from the former (7-state) RideStatus to cover the richer lifecycle
 * used across taxi / intercity / freight / courier / tourism services:
 *
 *   REQUESTED -> SEARCHING -> ACCEPTED -> ARRIVED -> IN_PROGRESS -> COMPLETED
 *        \                        \                                  \
 *         \  CANCELLED_BY_PASSENGER \  CANCELLED_BY_DRIVER            CANCELLED
 *                                       EXPIRED
 */

const ALL_TRIP_STATUSES = [
    'REQUESTED',
    'SEARCHING',
    'ACCEPTED',
    'ARRIVED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'EXPIRED',
];

const TERMINAL_STATES = [
    'COMPLETED',
    'CANCELLED',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'EXPIRED',
];

/** @param {string} value @returns {boolean} */
function isValidTripStatus(value) {
    return ALL_TRIP_STATUSES.includes(value);
}

/** @param {string} status @returns {boolean} */
function isTerminalStatus(status) {
    return TERMINAL_STATES.includes(status);
}

const TripStatus = Object.freeze({
    REQUESTED: 'REQUESTED',
    SEARCHING: 'SEARCHING',
    ACCEPTED: 'ACCEPTED',
    ARRIVED: 'ARRIVED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    CANCELLED_BY_PASSENGER: 'CANCELLED_BY_PASSENGER',
    CANCELLED_BY_DRIVER: 'CANCELLED_BY_DRIVER',
    EXPIRED: 'EXPIRED',
    ALL_TRIP_STATUSES: Object.freeze(ALL_TRIP_STATUSES),
    TERMINAL_STATES: Object.freeze(TERMINAL_STATES),
    isValidTripStatus,
    isTerminalStatus,
});

module.exports = TripStatus;
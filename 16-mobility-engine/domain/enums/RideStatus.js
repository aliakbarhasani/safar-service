/**
 * RideStatus - BACKWARD-COMPAT SHIM (Mobility Engine, Phase 1)
 *
 * The canonical status set has been promoted to `TripStatus` (9-state,
 * see ./TripStatus.js). This shim re-exports `TripStatus` so existing Phase-1
 * consumers (application use cases, controller, tests) continue to resolve
 * `RideStatus` during the transition. Phase 2 will rename consumers to
 * `TripStatus`.
 */
const TripStatus = require('./TripStatus');

// `TripStatus` is frozen, so spread its (enumerable) members into a fresh
// frozen object instead of mutating it, then re-add the legacy helper name.
module.exports = Object.freeze({
    ...TripStatus,
    isValidRideStatus: TripStatus.isValidTripStatus,
});
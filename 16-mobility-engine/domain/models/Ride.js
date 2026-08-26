/**
 * Ride - BACKWARD-COMPAT SHIM (Mobility Engine, Phase 1)
 *
 * The canonical domain model has been promoted to `Trip` (see ./Trip.js).
 * This shim re-exports `Trip` so existing Phase-1 consumers (application use
 * cases, repository, controller, tests) continue to resolve `Ride` during the
 * transition. Phase 2 will rename consumers to `Trip`.
 */
module.exports = require('./Trip');
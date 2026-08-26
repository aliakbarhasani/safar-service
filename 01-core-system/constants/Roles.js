/**
 * Roles.js - SINGLE SOURCE OF TRUTH for allowed architecture user roles.
 *
 * Unifies the role vocabulary (incl. the newly added `courier`) so modules
 * derive their allowed role set from this single constant instead of
 * maintaining separate enum/hardcoded lists.
 *
 * Base enum (001): passenger, driver, provider, admin, super_admin
 * Extended (012):  seller, advertiser
 * Unified (019):   + courier
 */

const Roles = Object.freeze({
  PASSENGER: 'passenger',
  DRIVER: 'driver',
  PROVIDER: 'provider',
  COURIER: 'courier',
  SELLER: 'seller',
  ADVERTISER: 'advertiser',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});

/** Immutable list of all valid architecture roles. */
const ALL_ROLES = Object.freeze(Object.values(Roles));

/** @param {*} role @returns {boolean} */
function isValidRole(role) {
  return ALL_ROLES.includes(role);
}

module.exports = { Roles, ALL_ROLES, isValidRole };
/**
 * ServiceTypes.js - SINGLE SOURCE OF TRUTH for allowed architecture service types.
 *
 * Unifies the previously-inconsistent service_type vocabularies:
 *   - 001_initial_global_schema.sql  : ENUM ('urban_taxi','intercity_taxi','freight','delivery')
 *   - 013_pricing_configs.sql         : 'urban_taxi','intercity_taxi','cargo_light','delivery'
 *   - trip-state.service.js           : 'taxi','intercity','border_transport','freight','delivery','tourism'
 *
 * All modules (trip engines, pricing, gateway...) MUST derive their allowed set
 * and validation from this single constant. No module hardcodes its own list.
 */

const ServiceTypes = Object.freeze({
  URBAN_TAXI: 'urban_taxi',
  INTERCITY_TAXI: 'intercity_taxi',
  FREIGHT: 'freight',
  DELIVERY: 'delivery',
  COURIER: 'courier',
  TOURISM: 'tourism',
  CROSS_BORDER: 'cross_border',
});

/** Immutable list of all valid architecture service types. */
const ALL_SERVICE_TYPES = Object.freeze(Object.values(ServiceTypes));

/** @param {*} type @returns {boolean} */
function isValidServiceType(type) {
  return ALL_SERVICE_TYPES.includes(type);
}

module.exports = { ServiceTypes, ALL_SERVICE_TYPES, isValidServiceType };
'use strict';

/**
 * Provider-neutral shipment lifecycle for Safar Service.
 *
 * Fleetbase (or another provider) must be translated into this vocabulary at
 * the integration boundary. Never trust a client-supplied status as authority.
 */
const SHIPMENT_STATUSES = Object.freeze([
  'draft',
  'booked',
  'ready_for_pickup',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'exception',
]);

const TRANSITIONS = Object.freeze({
  draft: ['booked', 'cancelled'],
  booked: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'exception'],
  in_transit: ['out_for_delivery', 'delivered', 'exception'],
  out_for_delivery: ['delivered', 'exception'],
  exception: ['ready_for_pickup', 'picked_up', 'in_transit', 'out_for_delivery', 'cancelled'],
  delivered: [],
  cancelled: [],
});

const PROVIDER_STATUS_MAP = Object.freeze({
  draft: 'draft',
  created: 'booked',
  pending: 'booked',
  scheduled: 'ready_for_pickup',
  ready_for_pickup: 'ready_for_pickup',
  assigned: 'ready_for_pickup',
  accepted: 'ready_for_pickup',
  picked_up: 'picked_up',
  pickup: 'picked_up',
  in_transit: 'in_transit',
  dispatched: 'in_transit',
  en_route: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  completed: 'delivered',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  failed: 'exception',
  exception: 'exception',
});

function normalizeProviderStatus(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: 'invalid_status' };
  }

  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const status = PROVIDER_STATUS_MAP[key];
  return status
    ? { ok: true, status }
    : { ok: false, reason: 'unsupported_status' };
}

function canTransitionShipment(currentStatus, nextStatus) {
  if (!SHIPMENT_STATUSES.includes(currentStatus) || !SHIPMENT_STATUSES.includes(nextStatus)) {
    return false;
  }
  return TRANSITIONS[currentStatus].includes(nextStatus);
}

function transitionShipment(currentStatus, nextStatus) {
  if (!SHIPMENT_STATUSES.includes(currentStatus)) {
    return { ok: false, reason: 'invalid_current_status' };
  }
  if (!SHIPMENT_STATUSES.includes(nextStatus)) {
    return { ok: false, reason: 'invalid_next_status' };
  }
  if (!canTransitionShipment(currentStatus, nextStatus)) {
    return { ok: false, reason: 'transition_not_allowed' };
  }
  return { ok: true, status: nextStatus };
}

module.exports = {
  SHIPMENT_STATUSES,
  canTransitionShipment,
  normalizeProviderStatus,
  transitionShipment,
};

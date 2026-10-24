'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SHIPMENT_STATUSES,
  canTransitionShipment,
  normalizeProviderStatus,
  transitionShipment,
} = require('../domain/shipment-status');

test('exposes a stable, provider-neutral shipment vocabulary', () => {
  assert.deepEqual(SHIPMENT_STATUSES, [
    'draft', 'booked', 'ready_for_pickup', 'picked_up', 'in_transit',
    'out_for_delivery', 'delivered', 'cancelled', 'exception',
  ]);
});

test('normalizes provider status aliases without trusting unknown values', () => {
  assert.deepEqual(normalizeProviderStatus('In Transit'), { ok: true, status: 'in_transit' });
  assert.deepEqual(normalizeProviderStatus('completed'), { ok: true, status: 'delivered' });
  assert.deepEqual(normalizeProviderStatus('mystery-state'), { ok: false, reason: 'unsupported_status' });
  assert.deepEqual(normalizeProviderStatus(null), { ok: false, reason: 'invalid_status' });
});

test('allows normal forward shipment progress', () => {
  assert.equal(canTransitionShipment('booked', 'ready_for_pickup'), true);
  assert.equal(canTransitionShipment('picked_up', 'in_transit'), true);
  assert.deepEqual(transitionShipment('out_for_delivery', 'delivered'), { ok: true, status: 'delivered' });
});

test('blocks skipped, backwards, and terminal-state transitions', () => {
  assert.equal(canTransitionShipment('booked', 'delivered'), false);
  assert.equal(canTransitionShipment('in_transit', 'booked'), false);
  assert.equal(canTransitionShipment('delivered', 'cancelled'), false);
  assert.deepEqual(transitionShipment('delivered', 'cancelled'), { ok: false, reason: 'transition_not_allowed' });
});

test('rejects unknown internal statuses', () => {
  assert.deepEqual(transitionShipment('made-up', 'delivered'), { ok: false, reason: 'invalid_current_status' });
  assert.deepEqual(transitionShipment('booked', 'made-up'), { ok: false, reason: 'invalid_next_status' });
});

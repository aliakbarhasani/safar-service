/**
 * trip-state-machine.test.js - Unit tests for the canonical 6-state Trip State Machine (P2-1)
 *
 * Covers all legal transitions plus illegal ones (e.g. ACCEPTED -> COMPLETED
 * must throw InvalidStateTransitionError).
 */

const {
  TRIP_STATES,
  ALLOWED_TRANSITIONS,
  InvalidStateTransitionError,
  isValidState,
  canTransition,
  transitionTo,
} = require('../../domain/trip-state-machine');

describe('trip-state-machine (P2-1 canonical 6-state lifecycle)', () => {
  test('exposes includes all canonical lifecycle states', () => {
    expect(Object.keys(TRIP_STATES).sort()).toEqual(
      ['ACCEPTED', 'ARRIVED', 'CANCELLED', 'COMPLETED', 'IN_PROGRESS', 'REQUESTED', 'SEARCHING'].sort(),
    );
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual(Object.keys(TRIP_STATES).sort());
  });

  test('allows all legal transitions', () => {
    const legal = [
      ['REQUESTED', 'SEARCHING'],
      ['REQUESTED', 'ACCEPTED'], // legacy/direct dispatch compatibility
      ['REQUESTED', 'CANCELLED'],
      ['SEARCHING', 'ACCEPTED'],
      ['SEARCHING', 'CANCELLED'],
      ['ACCEPTED', 'ARRIVED'],
      ['ACCEPTED', 'CANCELLED'],
      ['ARRIVED', 'IN_PROGRESS'],
      ['ARRIVED', 'CANCELLED'],
      ['IN_PROGRESS', 'COMPLETED'],
    ];
    for (const [from, to] of legal) {
      expect(canTransition(from, to)).toBe(true);
      expect(transitionTo(from, to)).toEqual({ from, to });
    }
  });

  test('rejects illegal transitions with InvalidStateTransitionError', () => {
    const illegal = [
      ['SEARCHING', 'IN_PROGRESS'],
      ['SEARCHING', 'REQUESTED'],
      ['REQUESTED', 'IN_PROGRESS'],
      ['REQUESTED', 'COMPLETED'],
      ['ACCEPTED', 'COMPLETED'], // the audit example: skip ARRIVED/IN_PROGRESS
      ['ACCEPTED', 'IN_PROGRESS'],
      ['ARRIVED', 'COMPLETED'], // must go through IN_PROGRESS
      ['ARRIVED', 'ACCEPTED'], // no backward transitions
      ['IN_PROGRESS', 'CANCELLED'], // cancel not allowed once started
      ['IN_PROGRESS', 'ARRIVED'],
      ['COMPLETED', 'CANCELLED'], // terminal: no outgoing
      ['CANCELLED', 'REQUESTED'], // terminal: no outgoing
      ['COMPLETED', 'COMPLETED'], // self-transition on terminal
    ];
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false);
      expect(() => transitionTo(from, to)).toThrow(InvalidStateTransitionError);
      try {
        transitionTo(from, to);
      } catch (err) {
        expect(err.code).toBe('INVALID_TRIP_STATE_TRANSITION');
        expect(err.statusCode).toBe(409);
      }
    }
  });

  test('rejects unknown states with UNKNOWN_TRIP_STATE (400)', () => {
    expect(isValidState('FLYING')).toBe(false);
    expect(() => transitionTo('FLYING', 'ACCEPTED')).toThrow(/Unknown current trip state/);
    expect(() => transitionTo('REQUESTED', 'FLYING')).toThrow(/Unknown target trip state/);
  });
});

/**
 * trip-state-machine.js - Trip State Machine (Mobility Engine Domain Layer)
 *
 * Canonical trip lifecycle guard:
 *   REQUESTED -> SEARCHING -> ACCEPTED
 *   REQUESTED -> ACCEPTED (legacy/direct dispatch compatibility)
 *   REQUESTED / SEARCHING -> CANCELLED
 *   ACCEPTED  -> ARRIVED  | CANCELLED
 *   ARRIVED   -> IN_PROGRESS | CANCELLED
 *   IN_PROGRESS -> COMPLETED
 *
 * TERMINAL: COMPLETED, CANCELLED (no outgoing transitions).
 *
 * NOTE on path: the executable mobility engine lives in `16-mobility-engine`
 * (there is no `06-mobility-service/` directory in this repo). This file is
 * the canonical implementation; `Trip` domain model delegates to it.
 */

const TRIP_STATES = Object.freeze({
  REQUESTED: 'REQUESTED',
  SEARCHING: 'SEARCHING',
  ACCEPTED: 'ACCEPTED',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

const ALLOWED_TRANSITIONS = Object.freeze({
  REQUESTED: Object.freeze(['SEARCHING', 'ACCEPTED', 'CANCELLED']),
  SEARCHING: Object.freeze(['ACCEPTED', 'CANCELLED']),
  ACCEPTED: Object.freeze(['ARRIVED', 'CANCELLED']),
  ARRIVED: Object.freeze(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: Object.freeze(['COMPLETED']),
  COMPLETED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

class InvalidStateTransitionError extends Error {
  constructor(currentState, nextState) {
    super(`Invalid trip state transition: ${currentState} -> ${nextState}`);
    this.name = 'InvalidStateTransitionError';
    this.code = 'INVALID_TRIP_STATE_TRANSITION';
    this.statusCode = 409;
    this.currentState = currentState;
    this.nextState = nextState;
  }
}

/**
 * @param {string} state
 * @returns {boolean}
 */
function isValidState(state) {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, state);
}

/**
 * @param {string} currentState
 * @param {string} nextState
 * @returns {boolean}
 */
function canTransition(currentState, nextState) {
  if (!isValidState(currentState) || !isValidState(nextState)) return false;
  return ALLOWED_TRANSITIONS[currentState].includes(nextState);
}

/**
 * Validates a transition; throws InvalidStateTransitionError when illegal.
 * @param {string} currentState
 * @param {string} nextState
 * @returns {{ from: string, to: string }} the validated transition
 */
function transitionTo(currentState, nextState) {
  if (!isValidState(currentState)) {
    const error = new Error(`Unknown current trip state: ${currentState}`);
    error.code = 'UNKNOWN_TRIP_STATE';
    error.statusCode = 400;
    throw error;
  }
  if (!isValidState(nextState)) {
    const error = new Error(`Unknown target trip state: ${nextState}`);
    error.code = 'UNKNOWN_TRIP_STATE';
    error.statusCode = 400;
    throw error;
  }
  if (!canTransition(currentState, nextState)) {
    throw new InvalidStateTransitionError(currentState, nextState);
  }
  return { from: currentState, to: nextState };
}

module.exports = {
  TRIP_STATES,
  ALLOWED_TRANSITIONS,
  InvalidStateTransitionError,
  isValidState,
  canTransition,
  transitionTo,
};

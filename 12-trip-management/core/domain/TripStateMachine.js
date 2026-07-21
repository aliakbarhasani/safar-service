/**
 * TripStateMachine
 *
 * Centralized state validation for Trip Management lifecycle transitions.
 */
class TripStateMachine {
  static STATUS = {
    PENDING_DRIVER: 'PENDING_DRIVER',
    ACCEPTED: 'ACCEPTED',
    ARRIVED: 'ARRIVED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  };

  static TRANSITIONS = {
    [TripStateMachine.STATUS.PENDING_DRIVER]: [TripStateMachine.STATUS.ACCEPTED, TripStateMachine.STATUS.CANCELLED],
    [TripStateMachine.STATUS.ACCEPTED]: [TripStateMachine.STATUS.ARRIVED, TripStateMachine.STATUS.CANCELLED],
    [TripStateMachine.STATUS.ARRIVED]: [TripStateMachine.STATUS.IN_PROGRESS, TripStateMachine.STATUS.CANCELLED],
    [TripStateMachine.STATUS.IN_PROGRESS]: [TripStateMachine.STATUS.COMPLETED],
  };

  static isValidTransition(currentStatus, nextStatus) {
    if (!currentStatus || !nextStatus) {
      return false;
    }

    const allowedTransitions = TripStateMachine.TRANSITIONS[currentStatus] || [];
    return allowedTransitions.includes(nextStatus);
  }
}

module.exports = TripStateMachine;

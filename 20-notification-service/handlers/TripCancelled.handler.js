'use strict';

/**
 * TripCancelled.handler — Listens to TripCancelled event
 * Sends push notification to the other party (driver or passenger).
 */
class TripCancelledHandler {
  constructor({ notificationRouter, logger = console } = {}) {
    if (!notificationRouter) {
      throw new Error('notificationRouter is required');
    }
    this.notificationRouter = notificationRouter;
    this.logger = logger;
    this.eventName = 'TripCancelled';
  }

  /**
   * Handle the event
   * @param {object} event — { data: { tripId, cancelledBy, role, driverId, passengerId, ... } }
   */
  async handle(event) {
    const { data } = event || {};
    if (!data) {
      this.logger.warn('[TripCancelledHandler] Invalid event data');
      return;
    }

    const { tripId, cancelledBy, role, driverId, passengerId, reason } = data;

    // Determine who to notify (the other party)
    let targetUserId;
    if (role === 'passenger') {
      // Passenger cancelled → notify driver
      targetUserId = driverId;
    } else if (role === 'driver') {
      // Driver cancelled → notify passenger
      targetUserId = passengerId;
    } else {
      // Unknown role → notify both
      const results = [];
      if (driverId) {
        results.push(await this._notifyParty(driverId, tripId, role, cancelledBy));
      }
      if (passengerId) {
        results.push(await this._notifyParty(passengerId, tripId, role, cancelledBy));
      }
      return results;
    }

    if (!targetUserId) {
      this.logger.warn('[TripCancelledHandler] No target user to notify');
      return;
    }

    return this._notifyParty(targetUserId, tripId, role, cancelledBy);
  }

  async _notifyParty(userId, tripId, cancelledByRole, cancelledBy) {
    this.logger.info(`[TripCancelledHandler] Notifying user=${userId} about trip=${tripId} cancellation`);

    const result = await this.notificationRouter.dispatch(
      userId,
      'TripCancelled',
      { tripId, cancelledByRole, cancelledBy },
      ['push']
    );

    this.logger.info(`[TripCancelledHandler] Notification sent to user=${userId}: ${result.channels.join(', ')}`);
    return result;
  }
}

module.exports = { TripCancelledHandler };
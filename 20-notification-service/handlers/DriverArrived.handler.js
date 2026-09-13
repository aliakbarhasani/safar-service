'use strict';

/**
 * DriverArrived.handler — Listens to DriverArrived event
 * Sends push notification to passenger.
 */
class DriverArrivedHandler {
  constructor({ notificationRouter, logger = console } = {}) {
    if (!notificationRouter) {
      throw new Error('notificationRouter is required');
    }
    this.notificationRouter = notificationRouter;
    this.logger = logger;
    this.eventName = 'DriverArrived';
  }

  /**
   * Handle the event
   * @param {object} event — { data: { tripId, passengerId, driverId, ... } }
   */
  async handle(event) {
    const { data } = event || {};
    if (!data || !data.passengerId) {
      this.logger.warn('[DriverArrivedHandler] Invalid event data: missing passengerId');
      return;
    }

    const { passengerId, tripId, driverId } = data;

    this.logger.info(`[DriverArrivedHandler] Notifying passenger=${passengerId} for trip=${tripId}`);

    const result = await this.notificationRouter.dispatch(
      passengerId,
      'DriverArrived',
      { tripId, driverId },
      ['push']
    );

    this.logger.info(`[DriverArrivedHandler] Notification sent: ${result.channels.join(', ')}`);
    return result;
  }
}

module.exports = { DriverArrivedHandler };
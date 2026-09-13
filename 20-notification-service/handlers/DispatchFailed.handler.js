'use strict';

/**
 * DispatchFailed.handler — Listens to DispatchFailed / NoDriverFound events
 * Sends push + SMS to passenger (critical event).
 */
class DispatchFailedHandler {
  constructor({ notificationRouter, logger = console } = {}) {
    if (!notificationRouter) {
      throw new Error('notificationRouter is required');
    }
    this.notificationRouter = notificationRouter;
    this.logger = logger;
    this.eventNames = ['DispatchFailed', 'NoDriverFound'];
  }

  /**
   * Handle the event
   * @param {object} event — { event: string, data: { tripId, passengerId, ... } }
   */
  async handle(event) {
    const { data } = event || {};
    if (!data || !data.passengerId) {
      this.logger.warn('[DispatchFailedHandler] Invalid event data: missing passengerId');
      return;
    }

    const { passengerId, tripId } = data;

    this.logger.info(`[DispatchFailedHandler] Notifying passenger=${passengerId} about dispatch failure for trip=${tripId}`);

    // Critical event: always sends push + SMS (forceSms=true in template)
    const result = await this.notificationRouter.dispatch(
      passengerId,
      event.event || 'DispatchFailed',
      { tripId },
      ['push']
    );

    this.logger.info(`[DispatchFailedHandler] Notification sent: ${result.channels.join(', ')}`);
    return result;
  }
}

module.exports = { DispatchFailedHandler };
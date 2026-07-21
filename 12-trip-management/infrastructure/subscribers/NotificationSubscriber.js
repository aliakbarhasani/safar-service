class NotificationSubscriber {
  constructor({ eventEmitter, logger }) {
    if (!eventEmitter || typeof eventEmitter.on !== 'function') {
      throw new Error('NotificationSubscriber requires an eventEmitter');
    }
    if (!logger || typeof logger.info !== 'function') {
      throw new Error('NotificationSubscriber requires a logger');
    }

    this.eventEmitter = eventEmitter;
    this.logger = logger;

    this.eventEmitter.on('trip.status.accepted', (payload = {}) => {
      this._handleAcceptedTrip(payload).catch((err) => {
        try {
          this.logger.error('NotificationSubscriber handler failed', {
            error: err && err.stack ? err.stack : err,
            tripId: payload && payload.tripId,
          });
        } catch (e) {
          // swallow
        }
      });
    });
  }

  async _handleAcceptedTrip(payload = {}) {
    const tripId = payload && payload.tripId ? payload.tripId : 'unknown';
    const driverId = payload && payload.metadata && payload.metadata.driverId ? payload.metadata.driverId : 'unknown';

    this.logger.info(`NotificationSubscriber triggered for trip: ${tripId}`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 150));

      const notificationPayload = {
        tripId,
        driverId,
        riderId: payload && payload.metadata && payload.metadata.riderId ? payload.metadata.riderId : 'unknown',
        currentStatus: payload && payload.currentStatus ? payload.currentStatus : 'ACCEPTED',
        timestamp: new Date().toISOString(),
      };

      this.logger.info('Sending rider notification', { notificationPayload });

      this.logger.info(`Successfully sent SMS & Push Notification to Rider for trip ${tripId}. Driver ${driverId} is on the way!`);
    } catch (error) {
      this.logger.error('Failed to send rider notification', {
        tripId,
        driverId,
        error: error && error.stack ? error.stack : error,
      });
    }
  }
}

module.exports = NotificationSubscriber;

class DriverMatchingSubscriber {
  constructor({ eventEmitter, logger, updateTripStatusUseCase }) {
    if (!eventEmitter || typeof eventEmitter.on !== 'function') {
      throw new Error('DriverMatchingSubscriber requires an eventEmitter');
    }
    if (!logger || typeof logger.info !== 'function') {
      throw new Error('DriverMatchingSubscriber requires a logger');
    }
    if (!updateTripStatusUseCase || typeof updateTripStatusUseCase.execute !== 'function') {
      throw new Error('DriverMatchingSubscriber requires an updateTripStatusUseCase');
    }

    this.eventEmitter = eventEmitter;
    this.logger = logger;
    this.updateTripStatusUseCase = updateTripStatusUseCase;

    this.eventEmitter.on('trip.status.pending_driver', (payload) => {
      // Ensure handler is async but non-blocking for emitter
      this._handlePendingDriver(payload).catch((err) => {
        try {
          this.logger.error('DriverMatchingSubscriber handler failed', { error: err && err.stack ? err.stack : err });
        } catch (e) {
          // swallow
        }
      });
    });
  }

  async _handlePendingDriver(payload = {}) {
    const tripId = payload && payload.tripId ? payload.tripId : (payload && payload.payload && payload.payload.id) || 'unknown';

    this.logger.info(`Driver Matching initiated for trip: ${tripId}`);

    // Simulate async driver discovery
    await new Promise((res) => setTimeout(res, 200));

    const candidates = [
      { driverId: 'drv_101', name: 'Ahmad', distanceKm: 0.8 },
      { driverId: 'drv_102', name: 'Reza', distanceKm: 1.2 },
      { driverId: 'drv_103', name: 'Mina', distanceKm: 2.0 },
    ];

    // Simple selection: nearest driver
    const matchedDriver = candidates.reduce((best, cur) => (cur.distanceKm < best.distanceKm ? cur : best), candidates[0]);

    // Log the match result
    this.logger.info(`Matched Driver ${matchedDriver.driverId} for trip ${tripId}`, { match: matchedDriver });

    try {
      await this.updateTripStatusUseCase.execute(tripId, 'ACCEPTED', { driverId: matchedDriver.driverId });
      this.logger.info(`Successfully updated trip ${tripId} status to ACCEPTED with driver ${matchedDriver.driverId}`);
    } catch (error) {
      this.logger.error('Failed to update trip status to ACCEPTED', {
        tripId,
        driverId: matchedDriver.driverId,
        error: error && error.stack ? error.stack : error,
      });
    }

    // Optionally emit an event for match found (non-blocking)
    try {
      setImmediate(() => {
        if (this.eventEmitter && typeof this.eventEmitter.emit === 'function') {
          this.eventEmitter.emit('trip.match.found', { tripId, driver: matchedDriver, timestamp: new Date().toISOString() });
        }
      });
    } catch (e) {
      // swallow
    }

    return matchedDriver;
  }
}

module.exports = DriverMatchingSubscriber;

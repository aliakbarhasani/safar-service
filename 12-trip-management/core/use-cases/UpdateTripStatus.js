/**
 * UpdateTripStatus Use Case
 *
 * Validates and applies permitted trip lifecycle transitions.
 */
const TripStateMachine = require('../domain/TripStateMachine');

class UpdateTripStatus {
  constructor(tripRepository, eventEmitter = null) {
    if (!tripRepository || typeof tripRepository.getById !== 'function' || typeof tripRepository.save !== 'function') {
      throw new Error('UpdateTripStatus requires a trip repository with getById and save methods');
    }

    this.tripRepository = tripRepository;
    this.eventEmitter = eventEmitter;
  }

  async execute(tripId, nextStatus, metadata = {}) {
    if (!tripId) {
      throw new Error('tripId is required');
    }

    const existingTrip = await this.tripRepository.getById(tripId);
    if (!existingTrip) {
      throw new Error(`Trip not found: ${tripId}`);
    }

    if (!TripStateMachine.isValidTransition(existingTrip.status, nextStatus)) {
      throw new Error(`Invalid status transition from ${existingTrip.status} to ${nextStatus}`);
    }

    const previousStatus = existingTrip.status;
    const updatedTrip = {
      ...existingTrip,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
      ...metadata,
    };

    const savedTrip = await this.tripRepository.save(updatedTrip);

    if (this.eventEmitter && typeof this.eventEmitter.emit === 'function') {
      const eventName = `trip.status.${nextStatus.toLowerCase()}`;
      const eventPayload = {
        tripId: savedTrip.id,
        previousStatus,
        currentStatus: savedTrip.status,
        timestamp: new Date().toISOString(),
        metadata: metadata || {},
      };

      setImmediate(() => {
        try {
          this.eventEmitter.emit(eventName, eventPayload);
        } catch (eventError) {
          // Intentionally swallow listener failures so the core transition remains durable.
        }
      });
    }

    return savedTrip;
  }
}

module.exports = UpdateTripStatus;

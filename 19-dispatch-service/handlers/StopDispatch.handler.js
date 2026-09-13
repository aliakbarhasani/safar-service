/**
 * StopDispatch.handler.js - Stops dispatch for accepted/cancelled trips
 * Removes pending BullMQ jobs when a trip is resolved
 */

class StopDispatchHandler {
  constructor({ dispatchQueue, eventBus }) {
    this.dispatchQueue = dispatchQueue;
    this.eventBus = eventBus;
  }

  async handle(event) {
    const { tripId } = event.data || {};
    if (!tripId) return;
    try {
      await this.dispatchQueue.removeJobsByTripId(tripId);
    } catch (e) {
      // Log but don't throw - cleanup is best-effort
    }
  }

  register() {
    if (this.eventBus) {
      this.eventBus.on("DriverAccepted", (event) => this.handle(event));
      this.eventBus.on("TripCancelled", (event) => this.handle(event));
    }
  }

  unregister() {
    if (this.eventBus) {
      this.eventBus.off("DriverAccepted", (event) => this.handle(event));
      this.eventBus.off("TripCancelled", (event) => this.handle(event));
    }
  }
}

module.exports = { StopDispatchHandler };
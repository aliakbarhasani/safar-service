/**
 * TripRequested.handler.js - Handles TripRequested event
 * Finds nearby available drivers and initiates dispatch queue
 */

class TripRequestedHandler {
  constructor({ locationService, driverService, dispatchQueue, eventBus, radiusKm = 3, maxDrivers = 5 } = {}) {
    this.locationService = locationService;
    this.driverService = driverService;
    this.dispatchQueue = dispatchQueue;
    this.eventBus = eventBus;
    this.radiusKm = radiusKm;
    this.maxDrivers = maxDrivers;
  }

  async handle(event) {
    const { tripId, originLat, originLng } = event.data || {};
    if (!tripId) return;

    // Find nearby drivers from Location Service
    let nearbyDrivers = [];
    try {
      if (this.locationService) {
        const result = await this.locationService.findNearbyDrivers(
          originLng, originLat, this.radiusKm
        );
        nearbyDrivers = result || [];
      }
    } catch (e) {
      nearbyDrivers = [];
    }

    // Filter available drivers
    const availableDriverIds = [];
    for (const driver of nearbyDrivers.slice(0, this.maxDrivers)) {
      const driverId = driver.driverId || driver.id;
      if (!driverId) continue;
      try {
        if (this.driverService) {
          const status = await this.driverService.getDriverStatus(driverId);
          if (status === "AVAILABLE" || status === "online") {
            availableDriverIds.push(driverId);
          }
        } else {
          availableDriverIds.push(driverId);
        }
      } catch (e) {
        availableDriverIds.push(driverId);
      }
    }

    if (availableDriverIds.length === 0) {
      if (this.eventBus) {
        this.eventBus.emit("DispatchFailed", {
          tripId,
          reason: "no_drivers_available",
          timestamp: new Date().toISOString()
        });
      }
      return;
    }

    // Schedule first offer immediately (no delay)
    await this.dispatchQueue.scheduleOffer(tripId, availableDriverIds, 0, 0);
  }

  register() {
    if (this.eventBus) {
      this.eventBus.on("TripRequested", (event) => this.handle(event));
    }
  }

  unregister() {
    if (this.eventBus) {
      this.eventBus.off("TripRequested", (event) => this.handle(event));
    }
  }
}

module.exports = { TripRequestedHandler };
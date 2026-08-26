/**
 * CreateTrip Use Case
 *
 * Orchestrates trip creation by:
 * 1. Requesting a fare quote from the pricing engine adapter.
 * 2. Building a trip entity with the resolved price and quote identifier.
 * 3. Persisting the trip through the repository.
 */
class CreateTrip {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.tripRepository - Repository implementing save()
   * @param {Object} dependencies.pricingServiceAdapter - Adapter implementing requestTripFare()
   */
  constructor(dependencies = {}) {
    this.tripRepository = dependencies.tripRepository || null;
    this.pricingServiceAdapter = dependencies.pricingServiceAdapter || null;
  }

  async execute(tripData = {}) {
    try {
      if (!this.tripRepository || typeof this.tripRepository.save !== 'function') {
        throw new Error('Trip repository is required');
      }

      if (!this.pricingServiceAdapter || typeof this.pricingServiceAdapter.requestTripFare !== 'function') {
        throw new Error('Pricing service adapter is required');
      }

      const pricingResult = await this.pricingServiceAdapter.requestTripFare(tripData);
      const finalPrice = pricingResult && typeof pricingResult.finalPrice === 'number'
        ? pricingResult.finalPrice
        : null;
      const quoteId = pricingResult && pricingResult.quoteId ? pricingResult.quoteId : null;

      const trip = {
        ...tripData,
        finalPrice,
        quoteId,
        status: 'PENDING_DRIVER',
        createdAt: new Date().toISOString(),
      };

      const savedTrip = await this.tripRepository.save(trip);

      if (savedTrip && typeof savedTrip === 'object') {
        return {
          ...savedTrip,
          status: savedTrip.status || trip.status,
        };
      }

      return trip;
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Trip creation failed',
        trip: null,
      };
    }
  }
}

module.exports = CreateTrip;

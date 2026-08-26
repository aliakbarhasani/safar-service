/**
 * TripController
 *
 * Presentation-layer controller for trip creation requests.
 * Delegates business orchestration to the CreateTrip use case.
 */
class TripController {
  constructor(createTripUseCase) {
    if (!createTripUseCase || typeof createTripUseCase.execute !== 'function') {
      throw new Error('TripController requires a CreateTrip use case');
    }

    this.createTripUseCase = createTripUseCase;
  }

  async createTrip(req, res) {
    try {
      const body = req && req.body ? req.body : {};
      const tripData = {
        riderId: body.riderId,
        origin: body.origin,
        destination: body.destination,
        demandFactor: body.demandFactor,
        tripId: body.tripId,
        distanceKm: body.distanceKm,
        durationMin: body.durationMin,
        serviceType: body.serviceType,
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        currencyId: body.currencyId,
      };

      const trip = await this.createTripUseCase.execute(tripData);

      if (trip && trip.success === false) {
        const eventEmitter = req && req.app && req.app.locals && req.app.locals.eventEmitter;
        if (eventEmitter && typeof eventEmitter.emit === 'function') {
          eventEmitter.emit('trip.status.failed', {
            tripData,
            error: trip.error || 'Trip request creation failed',
          });
        }

        return this._respond(res, 500, {
          success: false,
          status_code: 500,
          message: trip.error || 'Trip request creation failed',
          data: null,
        });
      }

      const eventEmitter = req && req.app && req.app.locals && req.app.locals.eventEmitter;
      if (eventEmitter && typeof eventEmitter.emit === 'function') {
        eventEmitter.emit('trip.status.pending_driver', {
          tripId: trip && trip.id ? trip.id : tripData.tripId,
          status: trip && trip.status ? trip.status : 'PENDING_DRIVER',
          payload: trip,
        });
      }

      return this._respond(res, 201, {
        success: true,
        status_code: 201,
        message: 'Trip request created successfully',
        data: trip,
      });
    } catch (error) {
      return this._respond(res, 400, {
        success: false,
        status_code: 400,
        message: error.message || 'Trip request creation failed',
        data: null,
      });
    }
  }

  getHealth(req, res) {
    return this._respond(res, 200, {
      success: true,
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsage: process.memoryUsage(),
    });
  }

  _respond(res, statusCode, payload) {
    if (res && typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(payload);
    }

    return {
      statusCode,
      ...payload,
    };
  }
}

module.exports = TripController;

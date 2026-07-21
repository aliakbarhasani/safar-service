const express = require('express');
const TripController = require('../controllers/TripController');
const CreateTrip = require('../../core/use-cases/CreateTrip');
const PricingServiceAdapter = require('../../infrastructure/services/PricingServiceAdapter');

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the current health status of the trip management service.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Service is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 uptimeSeconds:
 *                   type: integer
 *                 memoryUsage:
 *                   type: object
 */

const router = express.Router();

class InMemoryTripRepository {
  constructor() {
    this.trips = [];
  }

  async save(trip) {
    const savedTrip = { ...trip, id: trip.id || `trip-${Date.now()}-${this.trips.length + 1}` };
    this.trips.push(savedTrip);
    return savedTrip;
  }

  async getById(id) {
    return this.trips.find((trip) => trip.id === id) || null;
  }
}

const tripRepository = new InMemoryTripRepository();
const pricingServiceAdapter = new PricingServiceAdapter();
const createTripUseCase = new CreateTrip({
  tripRepository,
  pricingServiceAdapter,
});
const tripController = new TripController(createTripUseCase);

/**
 * @openapi
 * /api/v1/trips:
 *   post:
 *     summary: Create a trip request
 *     description: Creates a new trip request and emits the pending-driver event.
 *     tags:
 *       - Trips
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               riderId:
 *                 type: string
 *               origin:
 *                 type: string
 *               destination:
 *                 type: string
 *               demandFactor:
 *                 type: number
 *               tripId:
 *                 type: string
 *               distanceKm:
 *                 type: number
 *               durationMin:
 *                 type: number
 *               serviceType:
 *                 type: string
 *               scopeType:
 *                 type: string
 *               scopeId:
 *                 type: string
 *               currencyId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Trip created successfully.
 *       400:
 *         description: Invalid trip request.
 *       500:
 *         description: Trip creation failed.
 */
router.get('/health', (req, res) => tripController.getHealth(req, res));
router.post('/', (req, res) => tripController.createTrip(req, res));

module.exports = router;
module.exports.tripRepository = tripRepository;
module.exports.tripController = tripController;

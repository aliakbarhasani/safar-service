const tripService = require('../services/trip.service');

async function createTrip(req, res) {
  try {
    const { from, to, userId } = req.body;
    if (userId == null) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const result = await tripService.createTrip({ from, to, userId });
    if (result && result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getTrips(req, res) {
  try {
    const trips = await tripService.getAllTrips();
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createTrip,
  getTrips
};

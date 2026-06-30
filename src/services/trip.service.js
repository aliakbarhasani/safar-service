const Trip = require('../models/trip.model');
const User = require('../models/user.model');

async function createTrip(data) {
  if (!data || data.userId == null) {
    return { error: 'userId is required' };
  }

  const user = await User.findById(data.userId);
  if (!user) {
    return { error: 'User not found' };
  }

  const trip = new Trip({
    from: data.from,
    to: data.to,
    userId: user._id
  });

  const saved = await trip.save();
  return saved.toObject();
}

async function getAllTrips() {
  return await Trip.find().lean();
}

module.exports = {
  createTrip,
  getAllTrips
};

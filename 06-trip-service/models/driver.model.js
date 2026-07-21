const mongoose = require('mongoose');

const DriverSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  status: { type: String, enum: ['available', 'busy', 'offline'], default: 'offline' },
  rating: { type: Number, default: 5.0, min: 0, max: 5 },
  vehicleDetails: {
    type: { type: String, default: 'sedan' },
    plate: { type: String, default: '' },
    color: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Driver', DriverSchema);
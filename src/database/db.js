const mongoose = require('mongoose');

async function connectDB() {
  const uri = 'mongodb://127.0.0.1:27017/safar-service';
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
}

module.exports = { connectDB };

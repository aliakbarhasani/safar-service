const mongoose = require('mongoose');
const config = require('../../14-config-system/server.config');

let connected = false;

async function connectDB() {
  const uri = config.db.uri;
  try {
    await mongoose.connect(uri);
    connected = true;
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
}

function isDBConnected() {
  return connected || mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDBConnected };
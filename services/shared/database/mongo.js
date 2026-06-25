const mongoose = require('mongoose');
const logger = require('../logger');

async function connectMongo(uri = process.env.MONGO_URI) {
  if (!uri) {
    logger.warn('MONGO_URI is not configured; starting without database connection');
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(uri);
  logger.info('MongoDB connected');
  return mongoose.connection;
}

module.exports = { connectMongo };


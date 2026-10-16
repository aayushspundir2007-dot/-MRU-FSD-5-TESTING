const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;
let redisClient;
try {
  redisClient = require('../utils/redisClient');
} catch (e) {}

/**
 * Connect to an in-memory MongoDB instance
 */
const connectTestDB = async () => {
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        launchTimeout: 30000,
      },
    });
  }
  const uri = mongoServer.getUri();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
  return uri;
};

/**
 * Clear all documents from all collections between test cases
 */
const clearTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
  if (redisClient && typeof redisClient.flushall === 'function') {
    try {
      await redisClient.flushall();
    } catch (e) {}
  }
};

/**
 * Disconnect Mongoose and stop in-memory MongoDB
 */
const disconnectTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
  if (redisClient && typeof redisClient.disconnect === 'function') {
    try {
      redisClient.disconnect();
    } catch (e) {}
  }
};

module.exports = {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
};

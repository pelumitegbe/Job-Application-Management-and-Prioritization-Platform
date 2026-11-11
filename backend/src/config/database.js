const mongoose = require('mongoose');

// How long to wait for a reachable MongoDB server before giving up.
const SERVER_SELECTION_TIMEOUT_MS = 5000;

/**
 * Connect to MongoDB. Resolves once the connection is established and
 * rejects with a descriptive error if it cannot be established.
 */
async function connectDatabase(uri, dbName = 'job_application_platform') {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      dbName,
    });
  } catch (err) {
    throw new Error('Failed to connect to MongoDB. Check credentials, network access, and Atlas configuration.', { cause: err });
  }

  const { connection } = mongoose;
  console.log(`[database] Connected to MongoDB database: ${connection.name}`);

  // Report problems that occur after the initial connection succeeded.
  connection.on('disconnected', () => {
    console.warn('[database] MongoDB disconnected');
  });
  connection.on('reconnected', () => {
    console.log('[database] MongoDB reconnected');
  });
  connection.on('error', () => {
    console.error('[database] MongoDB connection error');
  });

  return connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };

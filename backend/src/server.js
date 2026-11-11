const { loadConfig } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const User = require('./models/User');
const app = require('./app');

async function start() {
  const config = loadConfig();

  // The HTTP server is only started after the database connection succeeds,
  // so the API never reports itself as running without a database.
  await connectDatabase(config.mongodbUri, config.mongodbDbName);

  // Wait until the unique email index exists before accepting registrations.
  await User.init();

  const server = app.listen(config.port);

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  console.log(`[server] Listening on http://localhost:${config.port}`);

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (err) => {
  console.error(`[server] Startup failed: ${err.message}`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});

const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const { createRequestLogger } = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

/**
 * Builds the Express application.
 * Options (mainly for tests):
 *   httpLogging    - true/false to force request logging on or off
 *                    (default: HTTP_LOGGING / environment, see requestLogger.js)
 *   httpLogStream  - where request log lines are written (default: stdout)
 */
function createApp({ httpLogging, httpLogStream } = {}) {
  const app = express();

  // First, so every request is logged exactly once, including CORS
  // preflights, 404s and errors.
  const requestLogger = createRequestLogger({
    ...(httpLogging === undefined ? {} : { enabled: httpLogging }),
    stream: httpLogStream,
  });
  if (requestLogger) app.use(requestLogger);

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json());

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/applications', applicationRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// The default application used by server.js and the existing tests.
const app = createApp();

module.exports = app;
module.exports.createApp = createApp;

const { pathWithoutQuery } = require('../utils/logSafety');

function notFound(req, res) {
  res.status(404).json({
    status: 'error',
    // Path only: the query string is not echoed back to the client.
    message: `Route not found: ${req.method} ${pathWithoutQuery(req)}`,
  });
}

module.exports = notFound;

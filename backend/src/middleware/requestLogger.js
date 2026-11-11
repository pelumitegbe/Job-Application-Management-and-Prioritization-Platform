const morgan = require('morgan');
const { pathWithoutQuery } = require('../utils/logSafety');

// Morgan's built-in `dev` format is used unchanged:
//   :method :url :status :response-time ms - :res[content-length]
// with the status colored green (2xx), cyan (3xx), yellow (4xx) or red (5xx).
//
// `dev` reads the URL from Morgan's `url` token, which by default includes the
// query string. Redefining that token makes every format log only the path,
// so query values (e.g. ?token=...) never reach the terminal. The `dev` format
// logs nothing else from the request: no body, headers, cookies or tokens.
morgan.token('url', pathWithoutQuery);

const ENABLED_VALUES = ['true', '1', 'on', 'yes'];
const DISABLED_VALUES = ['false', '0', 'off', 'no'];

/**
 * Parses the HTTP_LOGGING environment variable.
 * Returns true/false, undefined when unset, or null when the value is invalid.
 */
function parseHttpLogging(value) {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = value.trim().toLowerCase();
  if (ENABLED_VALUES.includes(normalized)) return true;
  if (DISABLED_VALUES.includes(normalized)) return false;
  return null;
}

/** True when running under `node --test` or with NODE_ENV=test. */
function isTestEnvironment(env) {
  return env.NODE_ENV === 'test' || env.NODE_TEST_CONTEXT !== undefined;
}

/**
 * Decides whether HTTP request logging is on.
 * HTTP_LOGGING wins when set to a valid value; otherwise logging is on by
 * default, except during automated tests.
 */
function isHttpLoggingEnabled(env = process.env) {
  const explicit = parseHttpLogging(env.HTTP_LOGGING);
  if (explicit === true || explicit === false) return explicit;
  return !isTestEnvironment(env);
}

/**
 * Returns the Morgan middleware, or null when logging is disabled.
 * `stream` defaults to process.stdout (tests pass their own).
 */
function createRequestLogger({ enabled = isHttpLoggingEnabled(), stream } = {}) {
  if (!enabled) return null;
  return morgan('dev', stream ? { stream } : undefined);
}

module.exports = { createRequestLogger, isHttpLoggingEnabled, parseHttpLogging };

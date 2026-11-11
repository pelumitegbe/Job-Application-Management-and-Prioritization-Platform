const { pathWithoutQuery, redact } = require('../utils/logSafety');
const { createValidationError } = require('../utils/httpError');
const { createIssues } = require('../validators/validationIssues');

// Express identifies error-handling middleware by its four parameters.
function errorHandler(err, req, res, next) {
  // If the response has already started, it can't be replaced with a JSON
  // error. Log the error and let Express's default handler close the connection.
  if (res.headersSent) {
    logServerError(err, req, 500);
    return next(err);
  }

  // Mongoose validation/cast errors (a safety net behind the request
  // validators) become 400s with field-level messages only; raw Mongoose
  // messages, values and schema details are not sent to the client.
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    err = toClientValidationError(err);
  }

  const statusCode = resolveStatusCode(err);

  // Expected client errors (400, 401, 404, 409, malformed JSON, ...) are not
  // logged here: Morgan already logs one line per request with its status.
  // Unexpected errors are logged once, with details, and never sent to the client.
  if (statusCode >= 500) {
    logServerError(err, req, statusCode);
  }

  const body = { status: 'error', message: clientMessage(err, statusCode) };

  // Field-level details for 400 validation errors: { fieldName: message }.
  if (statusCode === 400 && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
    body.errors = err.fieldErrors;
  }

  return res.status(statusCode).json(body);
}

function clientMessage(err, statusCode) {
  if (statusCode >= 500) return 'Internal server error';
  // express.json() reports syntax errors with the JavaScript parser's message
  // (e.g. "Unexpected token } in JSON at position 12"); replace it.
  if (err.type === 'entity.parse.failed') return 'Request body must be valid JSON.';
  return err.message;
}

// Uses err.status / err.statusCode (set by createHttpError and body-parser)
// when it is a valid HTTP error code; anything else is treated as a 500.
function resolveStatusCode(err) {
  const candidate = err?.status ?? err?.statusCode;
  return Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
}

/**
 * Logs one entry per unexpected error: the request line (path only, no query
 * string), the error name and message, its cause chain and the stack trace.
 * Only these selected fields are logged, never the whole error object: error
 * objects can carry request bodies, connection details or other data. All text
 * is redacted for connection-string credentials, bearer tokens and JWTs.
 * Request bodies, headers, cookies and query strings are never logged.
 */
function logServerError(err, req, statusCode) {
  const lines = [`[error] ${statusCode} ${req.method} ${pathWithoutQuery(req)}`];

  if (err instanceof Error) {
    lines.push(err.stack || `${err.name}: ${err.message}`);
    let cause = err.cause;
    for (let depth = 0; cause && depth < 3; depth += 1) {
      lines.push(cause instanceof Error ? `Caused by: ${cause.stack || cause.message}` : `Caused by: ${typeof cause}`);
      cause = cause instanceof Error ? cause.cause : undefined;
    }
  } else {
    // Something other than an Error was thrown; log its type, not its contents.
    lines.push(`Non-Error value thrown (type: ${err === null ? 'null' : typeof err})`);
  }

  console.error(redact(lines.join('\n')));
}

function toClientValidationError(err) {
  const mongooseErrors = err.name === 'ValidationError' ? Object.values(err.errors) : [err];
  const issues = createIssues();
  for (const fieldError of mongooseErrors) {
    // Custom schema messages (e.g. "company is required.") are client-safe.
    // Mongoose's built-in messages (which quote paths/values in backticks)
    // and cast errors are replaced with a generic per-field message.
    const message =
      fieldError.name === 'ValidatorError' && !fieldError.message.includes('`')
        ? fieldError.message
        : `${fieldError.path} has an invalid value.`;
    issues.add(fieldError.path ?? null, message);
  }
  return createValidationError(issues);
}

module.exports = errorHandler;

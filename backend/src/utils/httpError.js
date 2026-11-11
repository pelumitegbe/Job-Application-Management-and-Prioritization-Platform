// Creates an Error carrying an HTTP status code. The central error handler
// sends `message` to the client for 4xx statuses, so messages passed here
// must be safe for clients to see.
function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Creates a 400 error from validator output. `message` keeps the established
 * "Validation failed: ..." text; `fieldErrors` (when any problem is tied to a
 * specific field) is sent to the client as the `errors` object.
 */
function createValidationError({ errors, fieldErrors }) {
  const err = createHttpError(400, `Validation failed: ${errors.join(' ')}`);
  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    err.fieldErrors = fieldErrors;
  }
  return err;
}

module.exports = { createHttpError, createValidationError };

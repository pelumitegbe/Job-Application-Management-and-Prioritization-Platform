// Collects validation problems in two forms:
//   errors      - ordered list of messages (joined into the response `message`)
//   fieldErrors - { fieldName: message } for the response `errors` object
// Only client-safe messages are added; submitted values are never included.

function createIssues() {
  const errors = [];
  const fieldErrors = {};

  return {
    errors,
    fieldErrors,
    /** Adds a message; pass field = null for problems not tied to one field. */
    add(field, message) {
      errors.push(message);
      if (field !== null && !Object.hasOwn(fieldErrors, field)) {
        // defineProperty keeps keys such as "__proto__" as ordinary own properties.
        Object.defineProperty(fieldErrors, field, {
          value: message,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    },
  };
}

module.exports = { createIssues };

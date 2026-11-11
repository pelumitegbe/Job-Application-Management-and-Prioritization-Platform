// Helpers that keep sensitive data out of server logs.

/**
 * The request path without its query string, e.g.
 * "/api/applications?page=2&limit=10" -> "/api/applications".
 * Query values are user-controlled and may contain secrets, so they are never logged.
 */
function pathWithoutQuery(req) {
  const url = req.originalUrl || req.url || '';
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

const REDACTIONS = [
  // Credentials inside MongoDB connection strings: mongodb+srv://user:pass@host
  [/(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi, '$1<credentials>@'],
  // Bearer tokens in header-like text
  [/(Bearer\s+)[^\s"',]+/gi, '$1<redacted>'],
  // Anything shaped like a JWT (header.payload.signature, base64url)
  [/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<jwt>'],
];

/** Removes credentials and tokens from text before it is logged. */
function redact(text) {
  return REDACTIONS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), String(text));
}

module.exports = { pathWithoutQuery, redact };

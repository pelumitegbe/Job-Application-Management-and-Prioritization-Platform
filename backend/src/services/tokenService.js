const jwt = require('jsonwebtoken');
const { getJwtSecret, JWT_ALGORITHM, JWT_EXPIRES_IN } = require('../config/auth');

// The token carries only the user's ID (as the standard `sub` claim).
function signAccessToken(userId) {
  return jwt.sign({}, getJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
    subject: String(userId),
  });
}

/**
 * Verifies signature, algorithm and expiry. Returns the user ID from `sub`.
 * Throws if the token is invalid in any way.
 */
function verifyAccessToken(token, secret = getJwtSecret()) {
  const payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new Error('Token has no subject');
  }
  return payload.sub;
}

/**
 * The token's expiry as an ISO 8601 UTC string, read from its own `exp`
 * claim (seconds since the epoch), so it always matches what verification enforces.
 */
function getTokenExpiresAt(token) {
  const { exp } = jwt.decode(token) || {};
  if (!Number.isInteger(exp)) throw new Error('Token has no exp claim');
  return new Date(exp * 1000).toISOString();
}

module.exports = { signAccessToken, verifyAccessToken, getTokenExpiresAt, JWT_EXPIRES_IN };

const mongoose = require('mongoose');
const { getJwtSecret } = require('../config/auth');
const { verifyAccessToken } = require('../services/tokenService');
const { createHttpError } = require('../utils/httpError');

const BEARER_PATTERN = /^Bearer ([^\s]+)$/i;

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * On success, sets `req.auth = { userId }` for downstream handlers.
 * Any token problem results in a generic 401; verification details are
 * never sent to the client.
 */
function authenticate(req, res, next) {
  const match = BEARER_PATTERN.exec(req.get('Authorization') || '');
  if (!match) {
    res.set('WWW-Authenticate', 'Bearer');
    return next(createHttpError(401, 'Authentication required.'));
  }

  // A missing/weak secret is a server misconfiguration (500), not a client error.
  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return next(err);
  }

  let userId;
  try {
    userId = verifyAccessToken(match[1], secret);
  } catch {
    userId = null;
  }

  if (!userId || !mongoose.isValidObjectId(userId)) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    return next(createHttpError(401, 'Invalid or expired token.'));
  }

  req.auth = { userId };
  return next();
}

module.exports = authenticate;

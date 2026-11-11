// Authentication settings. The JWT secret is read from the environment on
// every call so it is never hardcoded and never cached in a module constant.

const MIN_JWT_SECRET_LENGTH = 32;

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRES_IN = '1h';

// bcrypt work factor (2^12 iterations); a common balance of security and speed.
const BCRYPT_SALT_ROUNDS = 12;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add a strong random secret to backend/.env.');
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long.`);
  }
  return secret;
}

module.exports = {
  getJwtSecret,
  JWT_ALGORITHM,
  JWT_EXPIRES_IN,
  BCRYPT_SALT_ROUNDS,
  MIN_JWT_SECRET_LENGTH,
};

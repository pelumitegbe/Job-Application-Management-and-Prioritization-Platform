const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { BCRYPT_SALT_ROUNDS } = require('../config/auth');
const { signAccessToken, getTokenExpiresAt, JWT_EXPIRES_IN } = require('./tokenService');
const { createHttpError } = require('../utils/httpError');
const { effectiveTimeZone } = require('../utils/timezone');

const DUPLICATE_KEY_ERROR_CODE = 11000;
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

// Compared against when the email is unknown, so that login takes roughly the
// same time whether or not the account exists (reduces user enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalization-placeholder', BCRYPT_SALT_ROUNDS);

// The only user fields ever returned by the API.
function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    // Effective time zone (UTC until the user chooses one) and whether it was chosen.
    timezone: effectiveTimeZone(user.timezone),
    timezoneSource: user.timezone ? 'user' : 'default',
  };
}

function duplicateEmailError() {
  return createHttpError(409, 'An account with this email already exists.');
}

async function registerUser({ name, email, password }) {
  if (await User.exists({ email })) {
    throw duplicateEmailError();
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  try {
    const user = await User.create({ name, email, passwordHash });
    return toPublicUser(user);
  } catch (err) {
    // Two simultaneous registrations can both pass the check above; the
    // unique index rejects the second one with a duplicate-key error.
    if (err && err.code === DUPLICATE_KEY_ERROR_CODE) {
      throw duplicateEmailError();
    }
    throw err;
  }
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');

  const passwordMatches = await bcrypt.compare(
    password,
    user ? user.passwordHash : DUMMY_PASSWORD_HASH
  );

  if (!user || !passwordMatches) {
    throw createHttpError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  const token = signAccessToken(user._id);
  return {
    token,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRES_IN,
    expiresAt: getTokenExpiresAt(token),
    user: toPublicUser(user),
  };
}

async function getUserById(userId) {
  const user = await User.findById(userId);
  return user ? toPublicUser(user) : null;
}

/** Saves the signed-in user's own time zone. Returns the public user, or null if the account no longer exists. */
async function updateUserTimeZone(userId, timezone) {
  const user = await User.findByIdAndUpdate(userId, { $set: { timezone } }, { new: true, runValidators: true });
  return user ? toPublicUser(user) : null;
}

/** The effective time zone for scoring, or null if the account no longer exists. */
async function getUserTimeZone(userId) {
  const user = await User.findById(userId, 'timezone');
  return user ? effectiveTimeZone(user.timezone) : null;
}

module.exports = { registerUser, loginUser, getUserById, updateUserTimeZone, getUserTimeZone, toPublicUser };

const { validateRegistration, validateLogin } = require('../validators/authValidators');
const authService = require('../services/authService');
const { createHttpError, createValidationError } = require('../utils/httpError');

// Express 5 forwards rejected promises from async handlers to the error handler.

async function register(req, res) {
  const validation = validateRegistration(req.body);
  if (validation.errors.length) throw createValidationError(validation);

  const user = await authService.registerUser(validation.value);
  res.status(201).json({ user });
}

async function login(req, res) {
  const validation = validateLogin(req.body);
  if (validation.errors.length) throw createValidationError(validation);

  const result = await authService.loginUser(validation.value);
  res.status(200).json(result);
}

async function me(req, res) {
  const user = await authService.getUserById(req.auth.userId);
  if (!user) {
    // The token is valid, but the account it refers to has been deleted.
    throw createHttpError(401, 'User account no longer exists.');
  }
  res.status(200).json({ user });
}

module.exports = { register, login, me };

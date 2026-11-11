// Pure input validation for authentication requests (no database access).
// Each function returns { value, errors, fieldErrors }: `errors` is a list of
// client-safe messages and `fieldErrors` maps each field to its message.
// Passwords are never included in error messages.

const { createIssues } = require('./validationIssues');

const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes of a password; longer passwords are
// rejected rather than silently truncated.
const PASSWORD_MAX_BYTES = 72;

// Pragmatic format check: one "@", no whitespace, and a dot in the domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateRegistration(body) {
  const { name, email, password } = body || {};
  const issues = createIssues();

  if (!isNonEmptyString(name)) {
    issues.add('name', 'name is required.');
  } else if (name.trim().length > NAME_MAX_LENGTH) {
    issues.add('name', `name must be at most ${NAME_MAX_LENGTH} characters.`);
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isNonEmptyString(email)) {
    issues.add('email', 'email is required.');
  } else if (normalizedEmail.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
    issues.add('email', 'email must be a valid email address.');
  }

  if (typeof password !== 'string' || password === '') {
    issues.add('password', 'password is required.');
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    issues.add('password', `password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  } else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    issues.add('password', `password must be at most ${PASSWORD_MAX_BYTES} bytes.`);
  }

  const { errors, fieldErrors } = issues;
  return {
    errors,
    fieldErrors,
    value: errors.length ? null : { name: name.trim(), email: normalizedEmail, password },
  };
}

function validateLogin(body) {
  const { email, password } = body || {};
  const issues = createIssues();

  if (!isNonEmptyString(email)) issues.add('email', 'email is required.');
  if (typeof password !== 'string' || password === '') issues.add('password', 'password is required.');

  const { errors, fieldErrors } = issues;
  return {
    errors,
    fieldErrors,
    value: errors.length ? null : { email: normalizeEmail(email), password },
  };
}

module.exports = {
  validateRegistration,
  validateLogin,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
};

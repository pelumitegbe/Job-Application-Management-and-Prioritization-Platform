// Client-side checks that mirror the backend's rules, for instant feedback.
// The backend remains the source of truth and re-validates everything.

export const NAME_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt limit enforced by the backend
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistrationForm({ name, email, password, confirmPassword }) {
  const errors = {};

  if (!name.trim()) errors.name = 'Name is required.';
  else if (name.trim().length > NAME_MAX_LENGTH) errors.name = `Name must be at most ${NAME_MAX_LENGTH} characters.`;

  if (!email.trim()) errors.email = 'Email is required.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';

  if (!password) errors.password = 'Password is required.';
  else if (password.length < PASSWORD_MIN_LENGTH) errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) errors.password = 'Password is too long.';

  if (!confirmPassword) errors.confirmPassword = 'Please confirm your password.';
  else if (password && confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';

  return errors;
}

export function validateLoginForm({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email is required.';
  if (!password) errors.password = 'Password is required.';
  return errors;
}

/** Turns backend field errors ("email must be a valid email address.") into sentence case. */
export function formatServerFieldErrors(fieldErrors = {}) {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, message]) => [field, message.charAt(0).toUpperCase() + message.slice(1)])
  );
}

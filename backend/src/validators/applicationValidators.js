// Pure input validation for job application requests (no database access).
// Like authValidators, each function returns { value, errors, fieldErrors }:
// `errors` is a list of client-safe messages, `fieldErrors` maps field -> message. Values are type-checked strictly:
// e.g. "5" is not accepted as an interestLevel and 1700000000 is not a date.

const { APPLICATION_STATUSES, LIMITS, isHttpUrl } = require('../models/JobApplication');
const { createIssues } = require('./validationIssues');

// Fields a client may set. Everything else is rejected.
const REQUIRED_STRING_FIELDS = ['company', 'position'];
const OPTIONAL_STRING_FIELDS = ['location', 'notes'];
const DATE_FIELDS = ['applicationDate', 'deadline', 'followUpDate'];
const EDITABLE_FIELDS = [
  ...REQUIRED_STRING_FIELDS,
  'status',
  'location',
  'jobUrl',
  ...DATE_FIELDS,
  'interestLevel',
  'notes',
];
// Server-managed fields, rejected with a specific message.
const PROTECTED_FIELDS = ['user', '_id', 'id', 'createdAt', 'updatedAt', '__v'];

const PAGINATION = { defaultPage: 1, defaultLimit: 20, maxLimit: 100 };

// "2026-11-30" or a full ISO 8601 date-time with a time zone,
// e.g. "2026-11-30T17:00:00Z" or "2026-11-30T17:00:00.000-05:00".
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // Reject impossible calendar dates such as 2026-02-30, which Date would roll over.
  const [, year, month, day] = match;
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) return null;

  return date;
}

/**
 * Validates one field. Returns { value } or { error }.
 * For optional fields, `null` or "" means "no value" and returns { clear: true }.
 */
function validateField(field, raw) {
  if (REQUIRED_STRING_FIELDS.includes(field)) {
    if (typeof raw !== 'string' || raw.trim() === '') return { error: `${field} is required.` };
    const value = raw.trim();
    if (value.length > LIMITS[field]) return { error: `${field} must be at most ${LIMITS[field]} characters.` };
    return { value };
  }

  if (field === 'status') {
    if (!APPLICATION_STATUSES.includes(raw)) {
      return { error: `status must be one of: ${APPLICATION_STATUSES.join(', ')}.` };
    }
    return { value: raw };
  }

  if (field === 'interestLevel') {
    if (!Number.isInteger(raw) || raw < 1 || raw > 5) {
      return { error: 'interestLevel must be an integer from 1 to 5.' };
    }
    return { value: raw };
  }

  // Remaining fields are optional and can be cleared.
  if (raw === null || raw === '') return { clear: true };

  if (OPTIONAL_STRING_FIELDS.includes(field)) {
    if (typeof raw !== 'string') return { error: `${field} must be a string.` };
    // Notes keep their formatting; short single-line fields are trimmed.
    const value = field === 'notes' ? raw : raw.trim();
    if (value === '') return { clear: true };
    if (value.length > LIMITS[field]) return { error: `${field} must be at most ${LIMITS[field]} characters.` };
    return { value };
  }

  if (field === 'jobUrl') {
    if (typeof raw !== 'string') return { error: 'jobUrl must be a valid http or https URL.' };
    const value = raw.trim();
    if (value.length > LIMITS.jobUrl) return { error: `jobUrl must be at most ${LIMITS.jobUrl} characters.` };
    if (!isHttpUrl(value)) return { error: 'jobUrl must be a valid http or https URL.' };
    return { value };
  }

  if (DATE_FIELDS.includes(field)) {
    const date = parseIsoDate(raw);
    if (!date) return { error: `${field} must be a valid date in YYYY-MM-DD or ISO 8601 format.` };
    return { value: date };
  }

  return { error: `${field} cannot be set.` }; // unreachable: all editable fields are handled above
}

function checkFieldNames(body, issues) {
  for (const field of Object.keys(body)) {
    if (PROTECTED_FIELDS.includes(field)) {
      issues.add(field, `${field} cannot be set by the client.`);
    } else if (!EDITABLE_FIELDS.includes(field)) {
      issues.add(field, `Unknown field: ${field}.`);
    }
  }
}

/** Validates a create request. Returns { value } with only the fields to store. */
function validateCreateApplication(body) {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object.'], fieldErrors: {}, value: null };
  }

  const issues = createIssues();
  checkFieldNames(body, issues);

  const value = {};
  for (const field of EDITABLE_FIELDS) {
    const isMissing = !(field in body);
    if (isMissing && !REQUIRED_STRING_FIELDS.includes(field)) continue; // schema default applies

    const result = validateField(field, body[field]);
    if (result.error) issues.add(field, result.error);
    else if (!result.clear) value[field] = result.value;
  }

  const { errors, fieldErrors } = issues;
  return { errors, fieldErrors, value: errors.length ? null : value };
}

/**
 * Validates a partial update. Returns { value: { set, unset } }, where `set`
 * holds new values and `unset` lists optional fields the client cleared with null or "".
 */
function validateUpdateApplication(body) {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object.'], fieldErrors: {}, value: null };
  }
  if (Object.keys(body).length === 0) {
    return { errors: ['Request body must contain at least one field to update.'], fieldErrors: {}, value: null };
  }

  const issues = createIssues();
  checkFieldNames(body, issues);

  const set = {};
  const unset = [];
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const result = validateField(field, body[field]);
    if (result.error) issues.add(field, result.error);
    else if (result.clear) unset.push(field);
    else set[field] = result.value;
  }

  const { errors, fieldErrors } = issues;
  return { errors, fieldErrors, value: errors.length ? null : { set, unset } };
}

function validateObjectId(id, name = 'id') {
  return typeof id === 'string' && OBJECT_ID_PATTERN.test(id)
    ? { errors: [], fieldErrors: {}, value: id }
    : {
      errors: [`${name} must be a valid 24-character hexadecimal ID.`],
      fieldErrors: { [name]: `${name} must be a valid 24-character hexadecimal ID.` },
      value: null,
    };
}

function validatePagination(query) {
  const issues = createIssues();
  const allowed = ['page', 'limit'];
  for (const key of Object.keys(query || {})) {
    if (!allowed.includes(key)) issues.add(key, `Unknown query parameter: ${key}.`);
  }

  function readPositiveInt(name, fallback) {
    const raw = query?.[name];
    if (raw === undefined) return fallback;
    if (typeof raw !== 'string' || !POSITIVE_INTEGER_PATTERN.test(raw)) {
      issues.add(name, `${name} must be a positive integer.`);
      return null;
    }
    return Number(raw);
  }

  const page = readPositiveInt('page', PAGINATION.defaultPage);
  const limit = readPositiveInt('limit', PAGINATION.defaultLimit);
  if (page !== null && !Number.isSafeInteger(page)) issues.add('page', 'page is too large.');
  if (limit !== null && limit > PAGINATION.maxLimit) {
    issues.add('limit', `limit must be at most ${PAGINATION.maxLimit}.`);
  }

  const { errors, fieldErrors } = issues;
  return { errors, fieldErrors, value: errors.length ? null : { page, limit } };
}

module.exports = {
  validateCreateApplication,
  validateUpdateApplication,
  validateObjectId,
  validatePagination,
  parseIsoDate,
  EDITABLE_FIELDS,
  PROTECTED_FIELDS,
  PAGINATION,
};

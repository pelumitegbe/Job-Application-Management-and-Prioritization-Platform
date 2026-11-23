// Form state <-> API payload conversion and client-side validation for the
// "Add application" form. Rules mirror the backend validators; the backend
// still re-validates everything.

import { APPLICATION_STATUSES, DEFAULT_INTEREST_LEVEL, DEFAULT_STATUS, FIELD_LIMITS } from '../constants/applications';

export const EMPTY_APPLICATION_FORM = {
  company: '',
  position: '',
  status: DEFAULT_STATUS,
  location: '',
  jobUrl: '',
  applicationDate: '',
  deadline: '',
  followUpDate: '',
  interestLevel: DEFAULT_INTEREST_LEVEL,
  notes: '',
};

// Order used to focus the first invalid field.
export const APPLICATION_FIELD_ORDER = [
  'company',
  'position',
  'status',
  'location',
  'jobUrl',
  'applicationDate',
  'deadline',
  'followUpDate',
  'interestLevel',
  'notes',
];

const DATE_FIELDS = ['applicationDate', 'deadline', 'followUpDate'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validateApplicationForm(values) {
  const errors = {};
  const company = values.company.trim();
  const position = values.position.trim();

  if (!company) errors.company = 'Company is required.';
  else if (company.length > FIELD_LIMITS.company) errors.company = `Company must be at most ${FIELD_LIMITS.company} characters.`;

  if (!position) errors.position = 'Position is required.';
  else if (position.length > FIELD_LIMITS.position) errors.position = `Position must be at most ${FIELD_LIMITS.position} characters.`;

  if (!APPLICATION_STATUSES.includes(values.status)) errors.status = 'Choose a valid status.';

  if (values.location.trim().length > FIELD_LIMITS.location) errors.location = `Location must be at most ${FIELD_LIMITS.location} characters.`;

  const jobUrl = values.jobUrl.trim();
  if (jobUrl && !isHttpUrl(jobUrl)) errors.jobUrl = 'Enter a full URL starting with http:// or https://.';
  else if (jobUrl.length > FIELD_LIMITS.jobUrl) errors.jobUrl = `Job URL must be at most ${FIELD_LIMITS.jobUrl} characters.`;

  for (const field of DATE_FIELDS) {
    if (values[field] && !isRealDate(values[field])) errors[field] = 'Enter a valid date.';
  }

  if (!Number.isInteger(values.interestLevel) || values.interestLevel < 1 || values.interestLevel > 5) {
    errors.interestLevel = 'Choose an interest level from 1 to 5.';
  }

  if (values.notes.length > FIELD_LIMITS.notes) errors.notes = `Notes must be at most ${FIELD_LIMITS.notes} characters.`;

  return errors;
}

/** Builds the POST body: trimmed values, empty optional fields omitted. */
export function toCreatePayload(values) {
  const payload = {
    company: values.company.trim(),
    position: values.position.trim(),
    status: values.status,
    interestLevel: values.interestLevel,
  };
  const location = values.location.trim();
  const jobUrl = values.jobUrl.trim();
  if (location) payload.location = location;
  if (jobUrl) payload.jobUrl = jobUrl;
  for (const field of DATE_FIELDS) {
    if (values[field]) payload[field] = values[field];
  }
  if (values.notes.trim()) payload.notes = values.notes;
  return payload;
}

export const APPLICATION_FIELD_LABELS = {
  company: 'Company',
  position: 'Position',
  status: 'Status',
  location: 'Location',
  jobUrl: 'Job posting URL',
  applicationDate: 'Application date',
  deadline: 'Deadline',
  followUpDate: 'Follow-up date',
  interestLevel: 'Interest level',
  notes: 'Notes',
};

/**
 * Splits the backend's field-level `errors` ({ jobUrl: "jobUrl must be a valid http or https URL." })
 * into messages for fields shown in the form (with the field name replaced by its label)
 * and any messages for fields the form does not show.
 */
export function mapServerFieldErrors(fieldErrors = {}) {
  const fields = {};
  const other = [];
  for (const [field, message] of Object.entries(fieldErrors)) {
    const label = APPLICATION_FIELD_LABELS[field];
    if (label) fields[field] = message.startsWith(field) ? label + message.slice(field.length) : message;
    else other.push(message);
  }
  return { fields, other };
}

const OPTIONAL_TEXT_FIELDS = ['location', 'jobUrl', 'notes'];

/** "2026-11-30T00:00:00.000Z" -> "2026-11-30" (the UTC calendar date the user entered). */
export function toDateInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** Converts an application from the API into form values. */
export function toFormValues(application) {
  return {
    company: application.company ?? '',
    position: application.position ?? '',
    status: application.status ?? EMPTY_APPLICATION_FORM.status,
    location: application.location ?? '',
    jobUrl: application.jobUrl ?? '',
    applicationDate: toDateInputValue(application.applicationDate),
    deadline: toDateInputValue(application.deadline),
    followUpDate: toDateInputValue(application.followUpDate),
    interestLevel: Number.isInteger(application.interestLevel) ? application.interestLevel : EMPTY_APPLICATION_FORM.interestLevel,
    notes: application.notes ?? '',
  };
}

/**
 * Builds a PATCH body containing only the fields that changed.
 * Optional fields that were emptied are sent as null, which the backend
 * treats as "clear this field" ($unset). Required fields are never sent empty
 * (validation prevents it). Ownership/ID fields are never included.
 */
export function toUpdatePayload(initial, values) {
  const before = normalizeForComparison(initial);
  const after = normalizeForComparison(values);
  const changes = {};
  for (const field of APPLICATION_FIELD_ORDER) {
    if (before[field] !== after[field]) changes[field] = after[field];
  }
  return changes;
}

// Normalized comparable values: trimmed strings, null for empty optional fields.
function normalizeForComparison(values) {
  const shape = {
    company: values.company.trim(),
    position: values.position.trim(),
    status: values.status,
    interestLevel: values.interestLevel,
  };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const raw = field === 'notes' ? values[field] : values[field].trim();
    shape[field] = raw.trim() ? raw : null;
  }
  for (const field of DATE_FIELDS) shape[field] = values[field] || null;
  return shape;
}

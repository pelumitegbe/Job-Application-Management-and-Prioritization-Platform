// IANA time zone helpers (built on Intl; no dependencies).
//
// Application dates (deadline, followUpDate, applicationDate) are calendar
// dates stored as midnight UTC ("2026-11-30" -> 2026-11-30T00:00:00.000Z).
// They are never converted to a time zone: Nov 30 is Nov 30 everywhere.
// Only "today" depends on the user's time zone, so priority scoring uses the
// user's local calendar date, expressed the same way (midnight UTC of that
// date). The scoring engine itself stays time-zone free.

const DEFAULT_TIMEZONE = 'UTC';
const TIMEZONE_MAX_LENGTH = 64;

// Region/City names (optionally Region/Sub/City), plus "UTC". Raw offsets such
// as "+05:00", which Intl also accepts, are not IANA identifiers and are rejected.
const IANA_PATTERN = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9][A-Za-z0-9_+-]*){1,2})$/;

// Lower-case lookup of the runtime's zone names, used only to fix letter case.
let knownZones;
function knownZoneByLowerCase(name) {
  if (!knownZones) {
    knownZones = new Map((typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []).map((z) => [z.toLowerCase(), z]));
  }
  return knownZones.get(name.toLowerCase());
}

/**
 * Returns the IANA identifier to store, or null if the value isn't a time zone
 * this runtime knows. A correctly written name is kept as chosen (ICU would
 * rewrite some current names to legacy aliases, e.g. Asia/Kolkata ->
 * Asia/Calcutta). Letter case is fixed ("america/chicago" -> "America/Chicago"),
 * and UTC aliases such as "Etc/UTC" become "UTC".
 */
function normalizeTimeZone(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > TIMEZONE_MAX_LENGTH || !IANA_PATTERN.test(candidate)) return null;
  let resolved;
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    return null; // RangeError: unknown time zone
  }
  if (resolved === 'UTC') return 'UTC';
  if (resolved.toLowerCase() === candidate.toLowerCase()) return resolved;
  const known = knownZoneByLowerCase(candidate);
  if (known) return known;
  // A correctly capitalised alias the runtime lists under another name (Asia/Kolkata) is kept as typed;
  // anything else (e.g. lower-case "us/pacific") is stored as the runtime's own name.
  return candidate.split('/').every((segment) => /^[A-Z]/.test(segment)) ? candidate : resolved;
}

function isValidTimeZone(value) {
  return normalizeTimeZone(value) !== null;
}

/** The stored preference, or UTC when none has been saved (accounts created before Milestone 5C). */
function effectiveTimeZone(stored) {
  return normalizeTimeZone(stored) ?? DEFAULT_TIMEZONE;
}

const formatters = new Map();
function partsFormatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' })
    );
  }
  return formatters.get(timeZone);
}

/** The calendar date ("YYYY-MM-DD") that `instant` falls on in `timeZone`. */
function calendarDateInTimeZone(instant, timeZone) {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * The scoring reference date for `instant` in `timeZone`: midnight UTC of the
 * local calendar date, the same representation used for stored date-only fields.
 */
function referenceDateFor(instant, timeZone) {
  return new Date(`${calendarDateInTimeZone(instant, timeZone)}T00:00:00.000Z`);
}

module.exports = {
  DEFAULT_TIMEZONE,
  TIMEZONE_MAX_LENGTH,
  normalizeTimeZone,
  isValidTimeZone,
  effectiveTimeZone,
  calendarDateInTimeZone,
  referenceDateFor,
};

// Time zone helpers built on Intl (no date library).
//
// Priority scores depend on "today" in the user's chosen time zone. These
// helpers find that calendar date and the next local midnight, so the app can
// refresh scores when the date changes. Application dates themselves are
// calendar dates (stored as midnight UTC) and are always shown in UTC; see
// formatDate in formatters.js.

export const DEFAULT_TIMEZONE = 'UTC';

/** The browser's IANA time zone, or null if it can't be determined. */
export function detectBrowserTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

// IANA "Region/City" names and "UTC" (raw offsets such as "+05:00" are not accepted by the backend).
const IANA_PATTERN = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9][A-Za-z0-9_+-]*){1,2})$/;

export function isValidTimeZone(value) {
  if (typeof value !== 'string' || !IANA_PATTERN.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Every time zone the browser knows, plus UTC, sorted. */
export function listTimeZones() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([DEFAULT_TIMEZONE, ...zones])].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}

const dateFormatters = new Map();
function dateParts(instant, timeZone) {
  if (!dateFormatters.has(timeZone)) {
    dateFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' })
    );
  }
  return Object.fromEntries(dateFormatters.get(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
}

/** The calendar date ("YYYY-MM-DD") of `instant` in `timeZone`. Same rule as the backend's reference date. */
export function calendarDateInTimeZone(instant, timeZone) {
  const { year, month, day } = dateParts(instant, timeZone);
  return `${year}-${month}-${day}`;
}

/**
 * The first instant after `now` that falls on the next calendar date in
 * `timeZone`. Found by binary search on the actual local date, so it is correct
 * when a day is 23 or 25 hours long (daylight saving) and in zones where
 * midnight itself is skipped (the day then starts at 01:00).
 */
export function nextLocalMidnight(now, timeZone) {
  const today = calendarDateInTimeZone(now, timeZone);
  let before = now.getTime(); // still `today`
  let after = before + 50 * 60 * 60 * 1000; // no local day is longer than 25 hours
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (calendarDateInTimeZone(new Date(middle), timeZone) > today) after = middle;
    else before = middle;
  }
  return new Date(after);
}

/** "9:41 PM" in the given zone, for showing what time it is there. */
export function formatTimeInZone(instant, timeZone) {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit', weekday: 'short', month: 'short', day: 'numeric' }).format(instant);
}

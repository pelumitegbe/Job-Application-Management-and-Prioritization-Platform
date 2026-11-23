// Display formatting helpers.

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Formats an ISO date from the API for display.
 * Dates entered as "YYYY-MM-DD" are stored by the backend as midnight UTC,
 * so they are formatted in UTC to avoid showing the previous day in
 * time zones west of UTC.
 */
export function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : SHORT_DATE.format(date);
}

/** "1 application" / "12 applications" */
export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const DATE_TIME = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Formats a real timestamp (createdAt/updatedAt) in the user's local time zone. */
export function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATE_TIME.format(date);
}

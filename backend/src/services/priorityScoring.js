// Priority scoring engine (pure functions: no database, no Express, no clock).
//
//   P = 0.40·D + 0.25·F + 0.20·S + 0.15·I
//
//   D  deadline urgency     (only for status "Saved"; expired or missing -> 0)
//   F  follow-up urgency    (overdue or due today -> 100; missing -> 0)
//   S  application stage    (Saved 40, Applied 60, Interviewing 90, Offer 100, Rejected 0)
//   I  interest             (interestLevel × 20)
//
// Every factor is on a 0–100 scale, so P is on a 0–100 scale. P is computed at
// full precision and rounded to the nearest integer once, at the end.
// Rejected applications always score 0 ("No action").
//
// All day counts compare calendar dates, not elapsed 24-hour periods. Stored
// dates are calendar dates at midnight UTC (2026-11-30 -> 2026-11-30T00:00:00Z),
// and `referenceDate` is "today" in the same form. The caller chooses today:
// the priorities endpoint passes the user's local calendar date in their time
// zone (utils/timezone.js referenceDateFor), so this module never needs to know
// about time zones and stays deterministic and testable.

const WEIGHTS = Object.freeze({ deadline: 0.4, followUp: 0.25, stage: 0.2, interest: 0.15 });
// The same weights as whole percentages: the weighted sum is computed as an exact
// integer (40D + 25F + 20S + 15I) and divided by 100 once, so .5 boundaries round
// correctly (no binary floating-point drift such as 0.4 × 90 = 36.00000000000001).
const WEIGHT_PERCENT = Object.freeze({ deadline: 40, followUp: 25, stage: 20, interest: 15 });

const STAGE_SCORES = Object.freeze({ Saved: 40, Applied: 60, Interviewing: 90, Offer: 100, Rejected: 0 });

const STAGE_EXPLANATIONS = Object.freeze({
  Saved: 'Application is saved but has not been submitted yet.',
  Applied: 'Application has been submitted.',
  Interviewing: 'Application is currently in the interviewing stage.',
  Offer: 'Application has reached the offer stage.',
  Rejected: 'Application is rejected and requires no further action.',
});

const CATEGORIES = Object.freeze([
  { min: 75, name: 'Critical' },
  { min: 50, name: 'High' },
  { min: 25, name: 'Medium' },
  { min: 1, name: 'Low' },
  { min: 0, name: 'No action' },
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Milliseconds at 00:00 UTC of the given instant's UTC calendar day, or null. */
function utcDayStart(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole UTC calendar days from `referenceDate` to `target` (negative = in the past), or null. */
function calendarDaysUntil(target, referenceDate) {
  const targetDay = utcDayStart(target);
  const referenceDay = utcDayStart(referenceDate);
  if (targetDay === null || referenceDay === null) return null;
  return Math.round((targetDay - referenceDay) / MS_PER_DAY);
}

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** D: deadline urgency. Applies only while the application is still "Saved". */
function scoreDeadline(application, referenceDate) {
  const daysUntil = calendarDaysUntil(application.deadline, referenceDate);
  const base = { score: 0, daysUntil, expired: daysUntil !== null && daysUntil < 0, applies: application.status === 'Saved' };

  if (daysUntil === null) return { ...base, explanation: 'No application deadline is set.' };
  if (!base.applies) {
    // Don't present a submission deadline as urgent once the application has moved on.
    return { ...base, explanation: 'Application deadline no longer affects priority because the application is past the Saved stage.' };
  }
  if (daysUntil < 0) return { ...base, explanation: `Application deadline has passed (${days(-daysUntil)} ago).` };
  if (daysUntil === 0) return { ...base, score: 100, explanation: 'Application deadline is today.' };

  let score;
  if (daysUntil <= 2) score = 90;
  else if (daysUntil <= 7) score = 70;
  else if (daysUntil <= 14) score = 40;
  else if (daysUntil <= 30) score = 20;
  else score = 10;
  return { ...base, score, explanation: `Application deadline is in ${days(daysUntil)}.` };
}

/** F: follow-up urgency. Overdue and due-today both score 100. */
function scoreFollowUp(application, referenceDate) {
  const daysUntil = calendarDaysUntil(application.followUpDate, referenceDate);
  const base = { score: 0, daysUntil, overdue: daysUntil !== null && daysUntil < 0 };

  if (daysUntil === null) return { ...base, explanation: 'No follow-up date is set.' };
  if (daysUntil < 0) return { ...base, score: 100, explanation: `Follow-up is overdue by ${days(-daysUntil)}.` };
  if (daysUntil === 0) return { ...base, score: 100, explanation: 'Follow-up is due today.' };

  let score;
  if (daysUntil <= 2) score = 85;
  else if (daysUntil <= 7) score = 60;
  else if (daysUntil <= 14) score = 30;
  else score = 10;
  return { ...base, score, explanation: `Follow-up is due in ${days(daysUntil)}.` };
}

/** S: stage importance from the status enum. */
function scoreStage(application) {
  const score = STAGE_SCORES[application.status];
  if (score === undefined) return { score: 0, explanation: 'Application status is not recognized.' };
  return { score, explanation: STAGE_EXPLANATIONS[application.status] };
}

/** I: interest = interestLevel × 20 (levels 1–5 -> 20–100). */
function scoreInterest(application) {
  const level = application.interestLevel;
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    return { score: 0, level: null, explanation: 'Interest level is not set.' };
  }
  return { score: level * 20, level, explanation: `Interest level is ${level} out of 5.` };
}

function categorize(score) {
  return CATEGORIES.find(({ min }) => score >= min).name;
}

/**
 * The earliest date that calls for action, used as the ranking tie-breaker:
 * the follow-up date (even if overdue) and the deadline (only while it still
 * applies: status Saved and not expired). Null if neither exists.
 */
function nextActionDate(application, deadline) {
  const candidates = [];
  if (utcDayStart(application.followUpDate) !== null) candidates.push(utcDayStart(application.followUpDate));
  if (deadline.applies && deadline.daysUntil !== null && !deadline.expired) candidates.push(utcDayStart(application.deadline));
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

/**
 * Scores one application as of `referenceDate`.
 * Returns { score, category, rawScore, factors, explanations, nextActionDate }.
 */
function scoreApplication(application, referenceDate) {
  if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
    throw new TypeError('scoreApplication requires a valid referenceDate (Date).');
  }

  const parts = {
    deadline: scoreDeadline(application, referenceDate),
    followUp: scoreFollowUp(application, referenceDate),
    stage: scoreStage(application),
    interest: scoreInterest(application),
  };

  let weightedSum = 0; // exact integer: Σ weight% × factor score
  const factors = {};
  for (const [name, part] of Object.entries(parts)) {
    weightedSum += WEIGHT_PERCENT[name] * part.score;
    const { score, explanation, ...details } = part;
    factors[name] = { score, weight: WEIGHTS[name], contribution: (WEIGHT_PERCENT[name] * score) / 100, explanation, ...details };
  }
  const rawScore = weightedSum / 100; // full precision, 0–100

  const isRejected = application.status === 'Rejected';
  const score = isRejected ? 0 : Math.round(rawScore);

  // Rejected: one clear explanation; urgency messages would be misleading.
  const explanations = isRejected
    ? [STAGE_EXPLANATIONS.Rejected]
    : [parts.deadline.explanation, parts.followUp.explanation, parts.stage.explanation, parts.interest.explanation];

  const actionDate = isRejected ? null : nextActionDate(application, parts.deadline);

  return {
    score,
    category: categorize(score),
    rawScore,
    ...(isRejected && { override: 'Rejected applications always score 0.' }),
    factors,
    explanations,
    nextActionDate: actionDate ? actionDate.toISOString().slice(0, 10) : null,
  };
}

/**
 * Deterministic ranking comparator:
 *   1. priority score, highest first;
 *   2. next action date, earliest first (applications with one come before those without);
 *   3. application id, ascending (stable final tie-breaker).
 */
function comparePriority(a, b) {
  if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
  const da = a.priority.nextActionDate;
  const db = b.priority.nextActionDate;
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1; // YYYY-MM-DD strings compare chronologically
  }
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

/** Scores and ranks applications (each must have an `id`). Returns new objects with a `priority` field. */
function rankApplications(applications, referenceDate) {
  return applications
    .map((application) => ({ ...application, priority: scoreApplication(application, referenceDate) }))
    .sort(comparePriority);
}

module.exports = {
  scoreApplication,
  rankApplications,
  comparePriority,
  categorize,
  calendarDaysUntil,
  WEIGHTS,
  STAGE_SCORES,
  CATEGORIES,
};

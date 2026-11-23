// Presentation helpers for backend priority data. Nothing here computes a
// score: these functions only read the backend's `priority` object
// (score, category, factors.*, explanations, nextActionDate) to pick labels,
// colours and warnings.

export const PRIORITY_CATEGORIES = ['Critical', 'High', 'Medium', 'Low', 'No action'];

// Colour is never the only cue: the category name and the numeric score are always shown.
// Text/background pairs are WCAG AA (4.5:1+).
export const CATEGORY_STYLES = {
  Critical: { badge: 'bg-red-50 text-red-700 ring-red-200', ring: '#dc2626', bar: 'bg-red-500', accent: 'border-l-red-500' },
  High: { badge: 'bg-orange-50 text-orange-800 ring-orange-200', ring: '#ea580c', bar: 'bg-orange-500', accent: 'border-l-orange-500' },
  Medium: { badge: 'bg-blue-50 text-blue-700 ring-blue-200', ring: '#2563eb', bar: 'bg-blue-500', accent: 'border-l-blue-500' },
  Low: { badge: 'bg-gray-100 text-gray-700 ring-gray-200', ring: '#6b7280', bar: 'bg-gray-400', accent: 'border-l-gray-300' },
  'No action': { badge: 'bg-gray-50 text-gray-600 ring-gray-200', ring: '#9ca3af', bar: 'bg-gray-300', accent: 'border-l-gray-200' },
};

export const FACTORS = [
  { key: 'deadline', letter: 'D', label: 'Deadline urgency' },
  { key: 'followUp', letter: 'F', label: 'Follow-up urgency' },
  { key: 'stage', letter: 'S', label: 'Application stage' },
  { key: 'interest', letter: 'I', label: 'Interest level' },
];

export const FORMULA = 'P = 0.40D + 0.25F + 0.20S + 0.15I';

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * Warning indicators derived from the backend's factor details:
 *   followUp.overdue / followUp.daysUntil, deadline.applies / expired / daysUntil.
 * Each: { key, label, tone } where tone is 'danger' | 'warning' | 'info' | 'muted'.
 */
export function urgencyIndicators(application) {
  if (application.status === 'Rejected') return [];
  const { deadline, followUp } = application.priority.factors;
  const indicators = [];

  if (followUp.overdue) indicators.push({ key: 'follow-up-overdue', label: `Follow-up overdue by ${days(-followUp.daysUntil)}`, tone: 'danger' });
  else if (followUp.daysUntil === 0) indicators.push({ key: 'follow-up-today', label: 'Follow-up due today', tone: 'warning' });

  if (deadline.applies && deadline.expired) indicators.push({ key: 'deadline-expired', label: 'Deadline passed', tone: 'muted' });
  else if (deadline.applies && deadline.daysUntil === 0) indicators.push({ key: 'deadline-today', label: 'Deadline today', tone: 'danger' });
  else if (deadline.applies && deadline.daysUntil !== null && deadline.daysUntil <= 7) {
    indicators.push({ key: 'deadline-soon', label: `Deadline in ${days(deadline.daysUntil)}`, tone: 'warning' });
  }
  return indicators;
}

/**
 * The single most relevant explanation (picked from the backend's text):
 * rejected -> the rejection message; otherwise the time-based factor with the
 * largest weighted contribution; an expired Saved deadline; else the stage.
 */
export function mostRelevantExplanation(application) {
  const { priority } = application;
  if (application.status === 'Rejected') return priority.explanations[0];
  const { deadline, followUp, stage } = priority.factors;
  const timed = [deadline, followUp].filter((f) => f.contribution > 0).sort((a, b) => b.contribution - a.contribution);
  if (timed.length) return timed[0].explanation;
  if (deadline.applies && deadline.expired) return deadline.explanation;
  return stage.explanation;
}

/**
 * Summary cards, counted over the full ranking (non-rejected only):
 *   actionable          every non-rejected application
 *   highPriority        category High or Critical
 *   overdueFollowUps    followUp.overdue
 *   upcomingDeadlines   Saved with an applicable deadline 0–7 calendar days away
 */
export function summarizePriorities(items) {
  const actionable = items.filter((a) => a.status !== 'Rejected');
  return {
    actionable: actionable.length,
    highPriority: actionable.filter((a) => a.priority.category === 'High' || a.priority.category === 'Critical').length,
    overdueFollowUps: actionable.filter((a) => a.priority.factors.followUp.overdue).length,
    upcomingDeadlines: actionable.filter((a) => {
      const d = a.priority.factors.deadline;
      return a.status === 'Saved' && d.applies && !d.expired && d.daysUntil !== null && d.daysUntil <= 7;
    }).length,
  };
}

/** Client-side filters over the full ranking; ranks stay global. */
export function filterPriorities(items, { category = '', status = '', includeRejected = false } = {}) {
  return items.filter(
    (a) => (includeRejected || a.status !== 'Rejected') && (!category || a.priority.category === category) && (!status || a.status === status)
  );
}

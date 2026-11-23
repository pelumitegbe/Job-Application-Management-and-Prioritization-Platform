// Job application constants mirroring the backend contract
// (backend/src/models/JobApplication.js and validators/applicationValidators.js).

export const APPLICATION_STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
export const DEFAULT_STATUS = 'Saved';

export const INTEREST_LEVELS = [1, 2, 3, 4, 5];
export const DEFAULT_INTEREST_LEVEL = 3;
export const INTEREST_LABELS = { 1: 'Very low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Very high' };

export const FIELD_LIMITS = {
  company: 150,
  position: 150,
  location: 200,
  jobUrl: 2048,
  notes: 5000,
};

// Page size used by the Applications page (backend default 20, max 100).
export const APPLICATIONS_PAGE_SIZE = 10;

// Status badge styles. Text/background pairs are 5.9:1 or higher (WCAG AA).
export const STATUS_STYLES = {
  Saved: { badge: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400' },
  Applied: { badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  Interviewing: { badge: 'bg-teal-50 text-teal-800 ring-teal-200', dot: 'bg-teal-500' },
  Offer: { badge: 'bg-green-50 text-green-800 ring-green-200', dot: 'bg-green-500' },
  Rejected: { badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
};

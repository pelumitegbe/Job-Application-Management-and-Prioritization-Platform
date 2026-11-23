// Job application API calls. Response shapes follow the backend contract:
//   GET  /api/applications?page&limit -> 200 { applications: [...], pagination: { page, limit, total, totalPages, hasNextPage, hasPrevPage } }
//   POST /api/applications            -> 201 { application }
// Both require the Bearer token, which apiRequest adds automatically.

import { ApiError, apiRequest } from './api';
import { notifyApplicationsChanged } from './applicationEvents';

function unexpectedResponse() {
  return new ApiError(200, 'The server returned an unexpected response.');
}

function isValidPagination(p) {
  return (
    p &&
    ['page', 'limit', 'total', 'totalPages'].every((key) => Number.isInteger(p[key])) &&
    typeof p.hasNextPage === 'boolean' &&
    typeof p.hasPrevPage === 'boolean'
  );
}

export async function listApplications({ page = 1, limit, signal } = {}) {
  const params = new URLSearchParams({ page: String(page) });
  if (limit) params.set('limit', String(limit));

  const data = await apiRequest(`/api/applications?${params}`, { signal });
  if (!data || !Array.isArray(data.applications) || !isValidPagination(data.pagination)) {
    throw unexpectedResponse();
  }
  return { applications: data.applications, pagination: data.pagination };
}

/** `data` must already use the backend's field names; empty optional fields should be omitted. */
export async function createApplication(data) {
  const application = requireApplication(await apiRequest('/api/applications', { method: 'POST', body: data }));
  notifyApplicationsChanged({ type: 'created', id: application.id });
  return application;
}

//   GET    /api/applications/:id -> 200 { application }   (404 if missing or owned by someone else)
//   PATCH  /api/applications/:id -> 200 { application }   (partial update; null/"" clears optional fields)
//   DELETE /api/applications/:id -> 204 (no body)

function requireApplication(result) {
  if (!result || typeof result.application !== 'object' || result.application === null) throw unexpectedResponse();
  return result.application;
}

export async function getApplication(id, { signal } = {}) {
  return requireApplication(await apiRequest(`/api/applications/${encodeURIComponent(id)}`, { signal }));
}

/** `changes` contains only the fields to update; optional fields set to null are cleared. */
export async function updateApplication(id, changes) {
  const application = requireApplication(await apiRequest(`/api/applications/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }));
  notifyApplicationsChanged({ type: 'updated', id });
  return application;
}

export async function deleteApplication(id) {
  await apiRequest(`/api/applications/${encodeURIComponent(id)}`, { method: 'DELETE' });
  notifyApplicationsChanged({ type: 'deleted', id });
}

// Dashboard statistics need every application, but the backend only offers a
// paginated list (max 100 per page) and no aggregate endpoint. Pages are fetched
// one after another (never in parallel) and the loop is capped, so a very large
// account can't trigger an unbounded number of requests.
export const STATS_PAGE_SIZE = 100; // backend maximum
export const STATS_MAX_PAGES = 10; // up to 1,000 applications

/**
 * Returns { applications, total, complete }. `total` always comes from the
 * backend's pagination metadata; `complete` is false if the cap was reached
 * before every page was read.
 */
export async function fetchAllApplications({ signal, pageSize = STATS_PAGE_SIZE, maxPages = STATS_MAX_PAGES } = {}) {
  const applications = [];
  let page = 1;
  let total = 0;
  let hasNextPage = true;

  while (hasNextPage && page <= maxPages) {
    const result = await listApplications({ page, limit: pageSize, signal });
    applications.push(...result.applications);
    total = result.pagination.total;
    hasNextPage = result.pagination.hasNextPage;
    page += 1;
  }

  return { applications, total, complete: !hasNextPage };
}

// ---------------------------------------------------------------------------
// Priorities: GET /api/applications/priorities?page&limit&includeRejected
//   -> 200 { applications: [{ ...application, priority }], pagination, scoring }
// The backend scores and ranks; the frontend never recalculates scores.
// ---------------------------------------------------------------------------

function isValidPriorityPage(data) {
  return (
    data &&
    Array.isArray(data.applications) &&
    isValidPagination(data.pagination) &&
    data.applications.every((a) => a && a.priority && Number.isInteger(a.priority.score) && typeof a.priority.category === 'string')
  );
}

export async function getPriorities({ page = 1, limit, includeRejected = false, signal } = {}) {
  const params = new URLSearchParams({ page: String(page) });
  if (limit) params.set('limit', String(limit));
  if (includeRejected) params.set('includeRejected', 'true');
  const data = await apiRequest(`/api/applications/priorities?${params}`, { signal });
  if (!isValidPriorityPage(data)) throw unexpectedResponse();
  return data;
}

export const PRIORITIES_PAGE_SIZE = 100; // backend maximum
export const PRIORITIES_MAX_PAGES = 10; // up to 1,000 ranked applications

/**
 * The complete ranking (including rejected applications, which the backend
 * always ranks last at score 0), read page by page in the backend's order,
 * sequentially and bounded. Summary cards and filters need the whole ranking;
 * filtering only the current page would give wrong totals.
 * Returns { items, total, complete, referenceDate }; each item gets `rank`
 * (its 1-based position in the backend ranking).
 */
export async function fetchAllPriorities({ signal, pageSize = PRIORITIES_PAGE_SIZE, maxPages = PRIORITIES_MAX_PAGES } = {}) {
  // If the scoring date or time zone changes between pages (midnight passed, or
  // the time zone was changed elsewhere), the pages would mix two rankings:
  // start again once so every item is scored for the same day.
  for (let attempt = 0; ; attempt += 1) {
    const result = await readRanking({ signal, pageSize, maxPages });
    if (result.consistent || attempt >= 1) return result;
  }
}

async function readRanking({ signal, pageSize, maxPages }) {
  const items = [];
  let page = 1;
  let total = 0;
  let hasNextPage = true;
  let scoring = null;
  let consistent = true;

  while (hasNextPage && page <= maxPages) {
    const data = await getPriorities({ page, limit: pageSize, includeRejected: true, signal });
    items.push(...data.applications);
    total = data.pagination.total;
    hasNextPage = data.pagination.hasNextPage;
    const pageScoring = data.scoring ?? null;
    if (scoring && pageScoring && (pageScoring.referenceDate !== scoring.referenceDate || pageScoring.timezone !== scoring.timezone)) consistent = false;
    scoring = pageScoring ?? scoring;
    page += 1;
  }

  return {
    items: items.map((item, index) => ({ ...item, rank: index + 1 })),
    total,
    complete: !hasNextPage,
    referenceDate: scoring?.referenceDate ?? null,
    timezone: scoring?.timezone ?? null,
    consistent,
  };
}

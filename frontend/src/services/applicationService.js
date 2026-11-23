// Job application API calls. Response shapes follow the backend contract:
//   GET  /api/applications?page&limit -> 200 { applications: [...], pagination: { page, limit, total, totalPages, hasNextPage, hasPrevPage } }
//   POST /api/applications            -> 201 { application }
// Both require the Bearer token, which apiRequest adds automatically.

import { ApiError, apiRequest } from './api';

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
  return requireApplication(await apiRequest('/api/applications', { method: 'POST', body: data }));
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
  return requireApplication(await apiRequest(`/api/applications/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }));
}

export async function deleteApplication(id) {
  await apiRequest(`/api/applications/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

// Centralized HTTP client for the backend API.
//
// - Prefixes paths with VITE_API_BASE_URL and sends/receives JSON.
// - Adds `Authorization: Bearer <token>` unless `auth: false`.
// - Never retries requests and never logs tokens or request bodies.
// - Throws ApiError for HTTP error responses (keeping the backend's `message`
//   and field-level `errors`) and NetworkError when no response was received.

import { getApiBaseUrl } from '../config';
import { getToken } from './tokenStorage';

const DEFAULT_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(status, message, fieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Unable to reach the server. Check your connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

// Called when an authenticated request gets 401 (expired/invalid session).
// The AuthContext registers a handler that clears the session; it does not
// navigate, so it cannot cause redirect loops.
let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

const GENERIC_MESSAGES = {
  401: 'Your session is no longer valid. Please log in again.',
  404: 'The requested resource was not found.',
  500: 'Something went wrong on the server. Please try again.',
};

function fallbackMessage(status) {
  return GENERIC_MESSAGES[status] || (status >= 500 ? GENERIC_MESSAGES[500] : `Request failed (HTTP ${status}).`);
}

async function parseBody(response) {
  if (response.status === 204 || response.status === 205) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // not JSON
  }
}

/**
 * Sends a request and returns the parsed JSON body (null for empty/204 responses).
 *
 * @param {string} path      API path, e.g. "/api/auth/me"
 * @param {object} options
 *   method   - HTTP method (default GET)
 *   body     - value to send as JSON
 *   auth     - attach the stored token (default true)
 *   signal   - optional AbortSignal
 *   timeoutMs
 */
export async function apiRequest(path, { method = 'GET', body, auth = true, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  // Resolved first so a missing VITE_API_BASE_URL is reported as a configuration
  // error rather than as a network failure.
  const url = `${getApiBaseUrl()}${path}`;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const onExternalAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled: propagate the AbortError
    if (controller.signal.reason?.name === 'TimeoutError') {
      throw new NetworkError('The server took too long to respond. Please try again.');
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  let data;
  try {
    data = await parseBody(response);
  } catch {
    throw new NetworkError('The connection was interrupted while reading the response.');
  }

  if (!response.ok) {
    const message = typeof data?.message === 'string' && data.message ? data.message : fallbackMessage(response.status);
    const fieldErrors = data && typeof data.errors === 'object' && data.errors !== null ? data.errors : {};
    const error = new ApiError(response.status, message, fieldErrors);
    // Only a request that carried a token can reveal an invalid session;
    // a 401 from login (no token) just means wrong credentials.
    if (response.status === 401 && token && unauthorizedHandler) unauthorizedHandler(error);
    throw error;
  }

  if (data === undefined) {
    throw new ApiError(response.status, 'The server returned an unexpected response.');
  }
  return data;
}

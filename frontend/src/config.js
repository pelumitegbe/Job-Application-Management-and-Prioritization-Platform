export const APP_NAME = 'Job Application Platform';
export const APP_TAGLINE = 'Track every job application and focus on the ones that matter most.';

/**
 * Backend base URL from VITE_API_BASE_URL (see .env.example).
 * Read on each call (not cached) so tests can stub it.
 */
export function getApiBaseUrl() {
  const value = import.meta.env.VITE_API_BASE_URL;
  if (!value) {
    throw new Error('VITE_API_BASE_URL is not set. Copy frontend/.env.example to frontend/.env.');
  }
  return value.replace(/\/+$/, '');
}

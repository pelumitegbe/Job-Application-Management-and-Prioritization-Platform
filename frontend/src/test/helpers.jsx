import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';

export const API = 'http://api.test';

export function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });
}

/** Finds the handler for "METHOD /path": exact keys first, then keys with ":param" segments. */
function matchRoute(routes, method, pathname) {
  const exact = routes[`${method} ${pathname}`];
  if (exact) return { handler: exact, params: {} };
  for (const [key, handler] of Object.entries(routes)) {
    const [routeMethod, routePath] = key.split(' ');
    if (routeMethod !== method || !routePath.includes(':')) continue;
    const names = [];
    const pattern = new RegExp(`^${routePath.replace(/:([A-Za-z]+)/g, (_, name) => (names.push(name), '([^/]+)'))}$`);
    const match = pattern.exec(pathname);
    if (match) return { handler, params: Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1])])) };
  }
  return null;
}

/**
 * Replaces global fetch. `routes` maps "METHOD /path" (optionally with ":param"
 * segments, e.g. "GET /api/applications/:id") to a function
 * (request) => Response | Promise<Response>. The request includes `params`.
 * Unmatched requests fail the test loudly.
 */
export function mockFetch(routes) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method || 'GET';
    const route = matchRoute(routes, method, pathname);
    if (!route) throw new Error(`Unexpected request: ${method} ${pathname}`);
    const body = init.body ? JSON.parse(init.body) : undefined;
    return route.handler({ url, init, body, headers: init.headers || {}, params: route.params });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const testUser = {
  id: '6650f1c2a1b2c3d4e5f60718',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  createdAt: '2026-11-01T12:00:00.000Z',
  // A saved preference, so the one-time time zone suggestion stays out of unrelated tests.
  timezone: 'UTC',
  timezoneSource: 'user',
};

export function inOneHour() {
  return new Date(Date.now() + 3600_000).toISOString();
}

export function storeSession({ token = 'stored.jwt.token', expiresAt = inOneHour() } = {}) {
  window.sessionStorage.setItem('jobAppPlatform.session', JSON.stringify({ token, expiresAt }));
}

export function readStoredSession() {
  const raw = window.sessionStorage.getItem('jobAppPlatform.session');
  return raw ? JSON.parse(raw) : null;
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/** Renders the full app (router + auth) at the given path. */
export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
        <LocationDisplay />
      </AuthProvider>
    </MemoryRouter>
  );
}

export function currentPath() {
  return screen.getByTestId('location').textContent;
}

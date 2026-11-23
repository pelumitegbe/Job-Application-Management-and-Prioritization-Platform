import { describe, expect, test } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentPath, inOneHour, jsonResponse, mockFetch, readStoredSession, renderApp, storeSession, testUser } from './helpers';

describe('protected routes', () => {
  test('an unauthenticated visitor to /dashboard is redirected to /login', async () => {
    const fetchMock = mockFetch({});
    renderApp('/dashboard');
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('/ redirects to /login when logged out', async () => {
    mockFetch({});
    renderApp('/');
    await waitFor(() => expect(currentPath()).toBe('/login'));
  });

  test('after logging in from a redirect, the user lands on the page they asked for', async () => {
    mockFetch({
      'POST /api/auth/login': () =>
        jsonResponse(200, { token: 't.t.t', tokenType: 'Bearer', expiresIn: '1h', expiresAt: inOneHour(), user: testUser }),
    });
    const user = userEvent.setup();
    renderApp('/dashboard');
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'SecurePassword123!');
    await user.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(currentPath()).toBe('/dashboard'));
  });

  test('unknown routes show the not-found page', async () => {
    mockFetch({});
    renderApp('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('authentication initialization', () => {
  test('waits for GET /api/auth/me before deciding, then shows the dashboard', async () => {
    let resolveMe;
    const fetchMock = mockFetch({ 'GET /api/auth/me': () => new Promise((resolve) => (resolveMe = resolve)) });
    storeSession({ token: 'stored.jwt.token' });
    renderApp('/dashboard');

    // Still verifying: no redirect yet.
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(currentPath()).toBe('/dashboard');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer stored.jwt.token');

    resolveMe(jsonResponse(200, { user: testUser }));
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Your account' })).getByText('ada@example.com')).toBeInTheDocument();
    expect(currentPath()).toBe('/dashboard');
  });

  test('a stored but invalid token (401 from /me) is cleared and the user is sent to login', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }) });
    storeSession({ token: 'revoked.jwt.token' });
    renderApp('/dashboard');

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(screen.getByRole('alert')).toHaveTextContent('Your session is no longer valid. Please log in again.');
    expect(readStoredSession()).toBeNull();
  });

  test('a token for a deleted account (401 from /me) is cleared', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(401, { status: 'error', message: 'User account no longer exists.' }) });
    storeSession();
    renderApp('/');
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(readStoredSession()).toBeNull();
  });

  test('an expired stored session is discarded without calling the server', async () => {
    const fetchMock = mockFetch({});
    storeSession({ expiresAt: new Date(Date.now() - 60_000).toISOString() });
    renderApp('/dashboard');

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(screen.getByRole('alert')).toHaveTextContent('Your session has expired. Please log in again.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readStoredSession()).toBeNull();
  });

  test('if the server is unreachable, the user sees a message and the token is kept for a retry', async () => {
    mockFetch({
      'GET /api/auth/me': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    storeSession({ token: 'stored.jwt.token' });
    renderApp('/dashboard');

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't reach the server to restore your session.");
    expect(readStoredSession()?.token).toBe('stored.jwt.token');
  });

  test('an authenticated user visiting /login or /register is redirected to the dashboard', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(200, { user: testUser }) });
    storeSession();
    renderApp('/login');
    await waitFor(() => expect(currentPath()).toBe('/dashboard'));
  });

  test('/ redirects to the dashboard when the stored session is valid', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(200, { user: testUser }) });
    storeSession();
    renderApp('/');
    await waitFor(() => expect(currentPath()).toBe('/dashboard'));
  });
});

describe('logout and expiry', () => {
  test('logging out clears the session and returns to login', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(200, { user: testUser }) });
    storeSession();
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(screen.getByRole('status')).toHaveTextContent('You have been logged out.');
    expect(readStoredSession()).toBeNull();
  });

  test('the dashboard is not reachable after logout', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(200, { user: testUser }) });
    storeSession();
    const user = userEvent.setup();
    renderApp('/dashboard');
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(currentPath()).toBe('/login'));

    // Even if a token were somehow still present, a new app load verifies it again;
    // here storage is empty so /dashboard redirects.
    renderApp('/dashboard');
    await waitFor(() => expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/login'));
  });

  test('the session ends automatically at expiresAt from the login response', async () => {
    mockFetch({
      'POST /api/auth/login': () =>
        jsonResponse(200, {
          token: 'short.lived.token',
          tokenType: 'Bearer',
          expiresIn: '1h',
          expiresAt: new Date(Date.now() + 300).toISOString(),
          user: testUser,
        }),
    });
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'SecurePassword123!');
    await user.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(currentPath()).toBe('/dashboard'));

    await waitFor(() => expect(currentPath()).toBe('/login'), { timeout: 2000 });
    expect(screen.getByRole('alert')).toHaveTextContent('Your session has expired. Please log in again.');
    expect(readStoredSession()).toBeNull();
  });

  test('the dashboard shows the user; upcoming features stay marked as coming soon', async () => {
    const emptyPage = (limit) => ({ applications: [], pagination: { page: 1, limit, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } });
    mockFetch({
      'GET /api/auth/me': () => jsonResponse(200, { user: testUser }),
      'GET /api/applications': () => jsonResponse(200, emptyPage(100)),
      'GET /api/applications/priorities': () => jsonResponse(200, emptyPage(3)),
    });
    storeSession();
    renderApp('/dashboard');

    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(within(header).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Log out' })).toBeInTheDocument();

    // Not-yet-built features are still labelled as coming soon.
    for (const name of ['Upcoming deadlines', 'Follow-up reminders']) {
      expect(within(screen.getByRole('region', { name })).getByText('Coming soon')).toBeInTheDocument();
    }
    // Statistics are real (here: an account with no applications), not placeholders.
    const overview = screen.getByRole('region', { name: 'Overview' });
    await waitFor(() => expect(within(overview).getByTestId('stat-total')).toHaveTextContent('Total applications0'));
    expect(within(overview).queryByText('Coming soon')).not.toBeInTheDocument();
    // Priority ranking is built now: the Top priorities card is live.
    const top = screen.getByRole('region', { name: 'Top priorities' });
    expect(within(top).queryByText('Coming soon')).not.toBeInTheDocument();
    expect(await within(top).findByText('Nothing to prioritise yet')).toBeInTheDocument();
  });

  test('sidebar: Dashboard, Applications, Priorities and Settings are links; Follow-ups is disabled, not a link', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(200, { user: testUser }) });
    storeSession();
    renderApp('/dashboard');

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Applications' })).toHaveAttribute('href', '/applications');
    expect(within(nav).getByRole('link', { name: 'Priorities' })).toHaveAttribute('href', '/priorities');
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    for (const label of ['Follow-ups']) {
      const item = within(nav).getByText(label).closest('[aria-disabled]');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent(/Soon: not available yet/);
    }
  });

  test('mobile navigation opens in a dialog and closes with Escape', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonResponse(200, { user: testUser }) });
    storeSession();
    const user = userEvent.setup();
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
    const dialog = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(dialog).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

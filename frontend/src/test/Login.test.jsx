import { describe, expect, test } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentPath, inOneHour, jsonResponse, mockFetch, readStoredSession, renderApp, testUser } from './helpers';

async function logIn(user, email = 'ada@example.com', password = 'SecurePassword123!') {
  if (email) await user.type(await screen.findByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: /log in/i }));
}

describe('Login page', () => {
  test('successful login stores the token and expiry and opens the dashboard', async () => {
    const expiresAt = inOneHour();
    const fetchMock = mockFetch({
      'POST /api/auth/login': ({ body }) => {
        expect(body).toEqual({ email: 'ada@example.com', password: 'SecurePassword123!' });
        return jsonResponse(200, { token: 'issued.jwt.token', tokenType: 'Bearer', expiresIn: '1h', expiresAt, user: testUser });
      },
    });
    const user = userEvent.setup();
    renderApp('/login');

    await logIn(user);

    await waitFor(() => expect(currentPath()).toBe('/dashboard'));
    expect(screen.getByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument();
    expect(readStoredSession()).toEqual({ token: 'issued.jwt.token', expiresAt });
    // The login response already contains the verified user: no extra /api/auth/me call.
    // (The dashboard then loads its statistics from /api/applications.)
    const authCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/api/auth/'));
    expect(authCalls).toHaveLength(1);
  });

  test('invalid credentials show the backend message and clear the password', async () => {
    mockFetch({
      'POST /api/auth/login': () => jsonResponse(401, { status: 'error', message: 'Invalid email or password.' }),
    });
    const user = userEvent.setup();
    renderApp('/login');

    await logIn(user, 'ada@example.com', 'WrongPassword1!');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(currentPath()).toBe('/login');
    expect(readStoredSession()).toBeNull();
  });

  test('required fields are validated before calling the API', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    renderApp('/login');

    await logIn(user, '', '');

    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('shows a loading state while logging in', async () => {
    let resolveRequest;
    const fetchMock = mockFetch({ 'POST /api/auth/login': () => new Promise((resolve) => (resolveRequest = resolve)) });
    const user = userEvent.setup();
    renderApp('/login');

    await logIn(user);
    const button = screen.getByRole('button', { name: /logging in/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRequest(jsonResponse(200, { token: 't.t.t', tokenType: 'Bearer', expiresIn: '1h', expiresAt: inOneHour(), user: testUser }));
    await waitFor(() => expect(currentPath()).toBe('/dashboard'));
  });

  test('network errors are distinguished from invalid credentials', async () => {
    mockFetch({
      'POST /api/auth/login': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const user = userEvent.setup();
    renderApp('/login');

    await logIn(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server');
  });

  test('links to the registration page', async () => {
    mockFetch({});
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(await screen.findByRole('link', { name: 'Create an account' }));
    expect(currentPath()).toBe('/register');
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });
});

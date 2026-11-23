import { describe, expect, test } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentPath, jsonResponse, mockFetch, renderApp, testUser } from './helpers';

async function fillForm(user, { name = 'Ada Lovelace', email = 'ada@example.com', password = 'SecurePassword123!', confirm = password } = {}) {
  if (name) await user.type(screen.getByLabelText('Full name'), name);
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  if (confirm) await user.type(screen.getByLabelText('Confirm password'), confirm);
}

const submit = () => screen.getByRole('button', { name: /create account/i });

describe('Registration page', () => {
  test('shows required-field errors and does not call the API', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    renderApp('/register');

    await user.click(await screen.findByRole('button', { name: /create account/i }));

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(screen.getByText('Please confirm your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Full name')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('validates email format and password length on the client', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    renderApp('/register');
    await screen.findByLabelText('Full name');

    await fillForm(user, { email: 'not-an-email', password: 'short' });
    await user.click(submit());

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('requires the password confirmation to match', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    renderApp('/register');
    await screen.findByLabelText('Full name');

    await fillForm(user, { confirm: 'DifferentPassword1!' });
    await user.click(submit());

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('clears a field error when the field is edited', async () => {
    mockFetch({});
    const user = userEvent.setup();
    renderApp('/register');
    await user.click(await screen.findByRole('button', { name: /create account/i }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Full name'), 'A');
    expect(screen.queryByText('Name is required.')).not.toBeInTheDocument();
  });

  test('successful registration sends only name, email and password, then goes to login', async () => {
    const fetchMock = mockFetch({ 'POST /api/auth/register': () => jsonResponse(201, { user: testUser }) });
    const user = userEvent.setup();
    renderApp('/register');
    await screen.findByLabelText('Full name');

    await fillForm(user, { email: '  Ada@Example.com ' });
    await user.click(submit());

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Ada Lovelace',
      email: 'Ada@Example.com',
      password: 'SecurePassword123!',
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(screen.getByText('Account created. Log in to get started.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(window.sessionStorage.length).toBe(0); // not logged in automatically
  });

  test('shows backend field-level validation errors next to their fields', async () => {
    mockFetch({
      'POST /api/auth/register': () =>
        jsonResponse(400, {
          status: 'error',
          message: 'Validation failed: email must be a valid email address.',
          errors: { email: 'email must be a valid email address.' },
        }),
    });
    const user = userEvent.setup();
    renderApp('/register');
    await screen.findByLabelText('Full name');

    await fillForm(user, { email: 'ada@example.c' });
    await user.click(submit());

    expect(await screen.findByText('Email must be a valid email address.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(currentPath()).toBe('/register');
  });

  test('shows a duplicate-email (409) error on the email field', async () => {
    mockFetch({
      'POST /api/auth/register': () => jsonResponse(409, { status: 'error', message: 'An account with this email already exists.' }),
    });
    const user = userEvent.setup();
    renderApp('/register');
    await screen.findByLabelText('Full name');

    await fillForm(user);
    await user.click(submit());

    // Shown under the email field and linked to it for screen readers.
    await screen.findByText('An account with this email already exists.');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('An account with this email already exists.');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('shows a loading state and prevents duplicate submissions', async () => {
    let resolveRequest;
    const fetchMock = mockFetch({
      'POST /api/auth/register': () => new Promise((resolve) => (resolveRequest = resolve)),
    });
    const user = userEvent.setup();
    renderApp('/register');
    await screen.findByLabelText('Full name');
    await fillForm(user);

    await user.click(submit());
    const button = screen.getByRole('button', { name: /creating account/i });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.keyboard('{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRequest(jsonResponse(201, { user: testUser }));
    await waitFor(() => expect(currentPath()).toBe('/login'));
  });

  test('shows a readable message when the server cannot be reached', async () => {
    mockFetch({
      'POST /api/auth/register': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const user = userEvent.setup();
    renderApp('/register');
    await screen.findByLabelText('Full name');
    await fillForm(user);
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server. Check your connection and try again.');
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  test('password visibility can be toggled', async () => {
    mockFetch({});
    const user = userEvent.setup();
    renderApp('/register');
    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});

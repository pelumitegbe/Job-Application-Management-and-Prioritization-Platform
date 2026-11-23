import { describe, expect, test } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentPath, jsonResponse, mockFetch, readStoredSession, renderApp, storeSession, testUser } from './helpers';
import { formatDate } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Fixtures shaped exactly like the backend responses
// ---------------------------------------------------------------------------
const hexId = (n) => n.toString(16).padStart(24, '0');

function makeApplication(n, overrides = {}) {
  return {
    id: hexId(n),
    user: testUser.id,
    company: `Company ${n}`,
    position: `Role ${n}`,
    status: 'Applied',
    interestLevel: 3,
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

function pageResponse(applications, { page = 1, limit = 10, total = applications.length } = {}) {
  const totalPages = Math.ceil(total / limit);
  return jsonResponse(200, {
    applications,
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  });
}

/** Backend-like paginated list over `all` (newest first). */
function paginatedHandler(all, limit = 10) {
  return ({ url }) => {
    const params = new URL(url).searchParams;
    const page = Number(params.get('page'));
    expect(params.get('limit')).toBe(String(limit));
    return pageResponse(all.slice((page - 1) * limit, page * limit), { page, limit, total: all.length });
  };
}

const meOk = () => jsonResponse(200, { user: testUser });

function setup(routes, path = '/applications') {
  storeSession({ token: 'valid.jwt.token' });
  const fetchMock = mockFetch({ 'GET /api/auth/me': meOk, ...routes });
  const user = userEvent.setup();
  renderApp(path);
  return { fetchMock, user };
}

const listCalls = (fetchMock) => fetchMock.mock.calls.filter(([url, init]) => url.includes('/api/applications') && (init.method || 'GET') === 'GET');
const postCalls = (fetchMock) => fetchMock.mock.calls.filter(([, init]) => init.method === 'POST');
const table = () => screen.getByTestId('applications-table');
const cards = () => screen.getByTestId('applications-cards');

async function openForm(user) {
  // The header button (the empty state may show a second one).
  const [addButton] = await screen.findAllByRole('button', { name: 'Add application' });
  await user.click(addButton);
  return screen.findByRole('dialog', { name: 'Add application' });
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
describe('Applications page: listing', () => {
  test('shows a loading state, then the applications from the API', async () => {
    let resolveList;
    const { fetchMock } = setup({ 'GET /api/applications': () => new Promise((resolve) => (resolveList = resolve)) });

    expect(await screen.findByText('Loading applications…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Applications' })).toBeInTheDocument();

    resolveList(pageResponse([makeApplication(1)]));
    expect(await screen.findByTestId('applications-table')).toBeInTheDocument();
    expect(screen.queryByText('Loading applications…')).not.toBeInTheDocument();

    const [url, init] = listCalls(fetchMock)[0];
    expect(new URL(url).searchParams.toString()).toBe('page=1&limit=10');
    expect(init.headers.Authorization).toBe('Bearer valid.jwt.token');
  });

  test('renders every available field, with status badges, dates and interest level', async () => {
    const full = makeApplication(1, {
      company: 'Microsoft',
      position: 'Software Engineering Intern',
      status: 'Interviewing',
      location: 'Redmond, WA',
      jobUrl: 'https://careers.microsoft.com/',
      applicationDate: '2026-11-11T00:00:00.000Z',
      deadline: '2026-11-30T00:00:00.000Z',
      interestLevel: 5,
    });
    const minimal = makeApplication(2, { company: 'Acme', position: 'Data Analyst', status: 'Saved', interestLevel: 3 });
    setup({ 'GET /api/applications': () => pageResponse([full, minimal]) });

    const rows = within(await screen.findByTestId('applications-table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);

    const first = within(rows[0]);
    expect(first.getByText('Software Engineering Intern')).toBeInTheDocument();
    expect(first.getByText('Microsoft')).toBeInTheDocument();
    expect(first.getByText('Interviewing')).toHaveClass('text-teal-800');
    expect(first.getByText('Redmond, WA')).toBeInTheDocument();
    expect(first.getByText(formatDate('2026-11-11T00:00:00.000Z'))).toBeInTheDocument();
    expect(first.getByText(formatDate('2026-11-30T00:00:00.000Z'))).toBeInTheDocument();
    expect(first.getByText('Interest 5 of 5 (Very high)')).toBeInTheDocument();
    const link = first.getByRole('link', { name: /Open job posting for Software Engineering Intern at Microsoft/ });
    expect(link).toHaveAttribute('href', 'https://careers.microsoft.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    const second = within(rows[1]);
    expect(second.getByText('Saved')).toHaveClass('text-gray-700');
    expect(second.getAllByText('—').length).toBeGreaterThanOrEqual(3); // no location/dates
    expect(second.queryByRole('link')).not.toBeInTheDocument();

    expect(screen.getByTestId('application-count')).toHaveTextContent('2 applications');
  });

  test('dates stored as midnight UTC are shown on the same calendar day', () => {
    expect(formatDate('2026-11-30T00:00:00.000Z')).toMatch(/30/);
    expect(formatDate(null)).toBeNull();
    expect(formatDate('not a date')).toBeNull();
  });

  test('each status has its own badge colour', async () => {
    const statuses = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
    setup({ 'GET /api/applications': () => pageResponse(statuses.map((status, i) => makeApplication(i + 1, { status }))) });
    const rows = within(await screen.findByTestId('applications-table')).getAllByRole('row').slice(1);
    const classes = statuses.map((status, i) => within(rows[i]).getByText(status).className);
    expect(new Set(classes).size).toBe(5);
  });

  test('an empty list shows the empty state with an Add application action', async () => {
    setup({ 'GET /api/applications': () => pageResponse([]) });
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    expect(screen.getByTestId('application-count')).toHaveTextContent('0 applications');
    expect(screen.getAllByRole('button', { name: 'Add application' })).toHaveLength(2);
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  test('responsive: a table for md+ and a card list for small screens, both with the same items', async () => {
    setup({ 'GET /api/applications': () => pageResponse([makeApplication(1), makeApplication(2)]) });
    await screen.findByTestId('applications-table');

    expect(table()).toHaveClass('hidden', 'md:block');
    expect(cards()).toHaveClass('md:hidden');
    expect(within(table()).getAllByRole('row')).toHaveLength(3); // header + 2
    expect(within(cards()).getAllByRole('listitem')).toHaveLength(2);
    expect(within(cards()).getByText('Role 1')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
describe('Applications page: pagination', () => {
  const all = Array.from({ length: 23 }, (_, i) => makeApplication(i + 1));

  test('moves between pages using the backend pagination metadata', async () => {
    const { fetchMock, user } = setup({ 'GET /api/applications': paginatedHandler(all) });
    const nav = await screen.findByRole('navigation', { name: 'Pagination' });

    expect(within(nav).getByText('Page 1 of 3')).toBeInTheDocument();
    expect(within(nav).getByText(/Showing/)).toHaveTextContent('Showing 1–10 of 23');
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(within(table()).getByText('Role 1')).toBeInTheDocument();

    await user.click(within(nav).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(nav).getByText('Page 2 of 3')).toBeInTheDocument());
    expect(within(table()).getByText('Role 11')).toBeInTheDocument();
    expect(within(table()).queryByText('Role 1')).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeEnabled();

    await user.click(within(nav).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(nav).getByText('Page 3 of 3')).toBeInTheDocument());
    expect(within(nav).getByText(/Showing/)).toHaveTextContent('Showing 21–23 of 23');
    expect(within(nav).getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(within(nav).getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(within(nav).getByText('Page 2 of 3')).toBeInTheDocument());

    // One request per page visited: the client never fetches everything.
    const pages = listCalls(fetchMock).map(([url]) => new URL(url).searchParams.get('page'));
    expect(pages).toEqual(['1', '2', '3', '2']);
  });

  test('opens the page given in the URL, and treats an invalid page as page 1', async () => {
    const { fetchMock } = setup({ 'GET /api/applications': paginatedHandler(all) }, '/applications?page=2');
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(new URL(listCalls(fetchMock)[0][0]).searchParams.get('page')).toBe('2');
  });

  test('a page past the end moves to the last page instead of showing nothing', async () => {
    const { fetchMock } = setup({ 'GET /api/applications': paginatedHandler(all) }, '/applications?page=9');
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
    expect(listCalls(fetchMock).map(([url]) => new URL(url).searchParams.get('page'))).toEqual(['9', '3']);
  });

  test('a single page hides nothing but disables both buttons', async () => {
    setup({ 'GET /api/applications': () => pageResponse([makeApplication(1)]) });
    const nav = await screen.findByRole('navigation', { name: 'Pagination' });
    expect(within(nav).getByText('Page 1 of 1')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('Applications page: errors', () => {
  test('network failure shows an error with a working retry', async () => {
    let attempts = 0;
    const { user } = setup({
      'GET /api/applications': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return pageResponse([makeApplication(1)]);
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load applications");
    expect(alert).toHaveTextContent('Unable to reach the server');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('applications-table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a server error shows a readable message', async () => {
    setup({ 'GET /api/applications': () => jsonResponse(500, { status: 'error', message: 'Internal server error' }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('The server had a problem loading your applications.');
  });

  test('an unexpected response shape is reported, not rendered', async () => {
    setup({ 'GET /api/applications': () => jsonResponse(200, { items: [] }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('The server returned an unexpected response.');
  });

  test('a 400 from the list endpoint (e.g. invalid pagination) shows the backend message', async () => {
    setup({ 'GET /api/applications': () => jsonResponse(400, { status: 'error', message: 'Validation failed: limit must be at most 100.' }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed: limit must be at most 100.');
  });

  test('an unauthorized response ends the session and returns to login', async () => {
    setup({ 'GET /api/applications': () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }) });
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(screen.getByRole('alert')).toHaveTextContent('Your session is no longer valid. Please log in again.');
    expect(readStoredSession()).toBeNull();
  });

  test('/applications requires authentication', async () => {
    const fetchMock = mockFetch({});
    renderApp('/applications');
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Creating applications
// ---------------------------------------------------------------------------
describe('Add application', () => {
  test('opens the form with all fields, defaults and required markers; Cancel closes without saving', async () => {
    const { fetchMock, user } = setup({ 'GET /api/applications': () => pageResponse([]) });
    await screen.findByText('No applications yet');
    const dialog = await openForm(user);

    const form = within(dialog);
    expect(form.getByLabelText(/^Company/)).toBeRequired();
    expect(form.getByLabelText(/^Position/)).toBeRequired();
    expect(form.getByLabelText('Status')).toHaveValue('Saved');
    expect(form.getAllByRole('option').map((o) => o.value)).toEqual(['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected']);
    expect(form.getByLabelText('Location')).not.toBeRequired();
    expect(form.getByLabelText('Job posting URL')).toHaveAttribute('type', 'url');
    for (const label of ['Application date', 'Deadline', 'Follow-up date']) {
      expect(form.getByLabelText(label)).toHaveAttribute('type', 'date');
    }
    expect(form.getByRole('group', { name: 'Interest level' })).toBeInTheDocument();
    expect(form.getByRole('radio', { name: '3 – Medium' })).toBeChecked();
    expect(form.getByLabelText('Notes').tagName).toBe('TEXTAREA');
    expect(form.getByLabelText(/^Company/)).toHaveFocus();

    await user.click(form.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  test('Escape also cancels', async () => {
    const { fetchMock, user } = setup({ 'GET /api/applications': () => pageResponse([]) });
    await screen.findByText('No applications yet');
    await openForm(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  test('required fields are validated on the client before any request', async () => {
    const { fetchMock, user } = setup({ 'GET /api/applications': () => pageResponse([]) });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));

    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    expect(dialog.getByText('Company is required.')).toBeInTheDocument();
    expect(dialog.getByText('Position is required.')).toBeInTheDocument();
    expect(dialog.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
    expect(dialog.getByLabelText(/^Company/)).toHaveAttribute('aria-invalid', 'true');
    expect(dialog.getByLabelText(/^Company/)).toHaveAccessibleDescription('Company is required.');
    expect(dialog.getByLabelText(/^Company/)).toHaveFocus();
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  test('an invalid job URL is caught on the client', async () => {
    const { fetchMock, user } = setup({ 'GET /api/applications': () => pageResponse([]) });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Engineer');
    await user.type(dialog.getByLabelText('Job posting URL'), 'acme.example/jobs');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));
    expect(dialog.getByText('Enter a full URL starting with http:// or https://.')).toBeInTheDocument();
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  test('creates an application with the exact backend field names, then refreshes page 1', async () => {
    const stored = [makeApplication(1)];
    let created;
    const { fetchMock, user } = setup({
      'GET /api/applications': ({ url }) => {
        const page = Number(new URL(url).searchParams.get('page'));
        return pageResponse(stored.slice((page - 1) * 10, page * 10), { page, total: stored.length });
      },
      'POST /api/applications': ({ body, headers }) => {
        expect(headers.Authorization).toBe('Bearer valid.jwt.token');
        created = makeApplication(99, { ...body, deadline: `${body.deadline}T00:00:00.000Z` });
        stored.unshift(created);
        return jsonResponse(201, { application: created });
      },
    });
    await screen.findByTestId('applications-table');
    const dialog = within(await openForm(user));

    await user.type(dialog.getByLabelText(/^Company/), '  Microsoft  ');
    await user.type(dialog.getByLabelText(/^Position/), 'Software Engineering Intern');
    await user.selectOptions(dialog.getByLabelText('Status'), 'Interviewing');
    await user.type(dialog.getByLabelText('Location'), 'Redmond, WA');
    await user.type(dialog.getByLabelText('Job posting URL'), 'https://careers.microsoft.com/');
    fireEvent.change(dialog.getByLabelText('Deadline'), { target: { value: '2026-11-30' } });
    await user.click(dialog.getByRole('radio', { name: '5 – Very high' }));
    await user.type(dialog.getByLabelText('Notes'), 'Referral from a friend.');

    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [, init] = postCalls(fetchMock)[0];
    expect(JSON.parse(init.body)).toEqual({
      company: 'Microsoft',
      position: 'Software Engineering Intern',
      status: 'Interviewing',
      interestLevel: 5,
      location: 'Redmond, WA',
      jobUrl: 'https://careers.microsoft.com/',
      deadline: '2026-11-30',
      notes: 'Referral from a friend.',
    });

    // Success notification + refreshed list with the new application first.
    const toastRegion = screen.getByRole('region', { name: 'Notifications' });
    expect(within(toastRegion).getByText('Application added')).toBeInTheDocument();
    expect(within(toastRegion).getByText('Software Engineering Intern at Microsoft was saved.')).toBeInTheDocument();
    await waitFor(() => expect(within(table()).getAllByRole('row')[1]).toHaveTextContent('Software Engineering Intern'));
    expect(listCalls(fetchMock)).toHaveLength(2);
    expect(screen.getByTestId('application-count')).toHaveTextContent('2 applications');
  });

  test('after creating from page 2, the list returns to page 1', async () => {
    const all = Array.from({ length: 12 }, (_, i) => makeApplication(i + 1));
    const { fetchMock, user } = setup(
      {
        'GET /api/applications': paginatedHandler(all),
        'POST /api/applications': ({ body }) => {
          const created = makeApplication(77, body);
          all.unshift(created);
          return jsonResponse(201, { application: created });
        },
      },
      '/applications?page=2'
    );
    await screen.findByText('Page 2 of 2');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Newest Role');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    expect(within(table()).getAllByRole('row')[1]).toHaveTextContent('Newest Role');
    expect(listCalls(fetchMock).map(([url]) => new URL(url).searchParams.get('page'))).toEqual(['2', '1']);
  });

  test('only filled-in optional fields are sent; defaults are status Saved and interest 3', async () => {
    const { fetchMock, user } = setup({
      'GET /api/applications': () => pageResponse([]),
      'POST /api/applications': ({ body }) => jsonResponse(201, { application: makeApplication(5, body) }),
    });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Engineer');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));
    expect(JSON.parse(postCalls(fetchMock)[0][1].body)).toEqual({ company: 'Acme', position: 'Engineer', status: 'Saved', interestLevel: 3 });
  });

  test('shows a loading state and prevents duplicate submissions', async () => {
    let resolvePost;
    const { fetchMock, user } = setup({
      'GET /api/applications': () => pageResponse([]),
      'POST /api/applications': () => new Promise((resolve) => (resolvePost = resolve)),
    });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Engineer');

    await user.click(dialog.getByRole('button', { name: 'Save application' }));
    const saving = dialog.getByRole('button', { name: /Saving/ });
    expect(saving).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(saving);
    await user.keyboard('{Enter}');
    expect(postCalls(fetchMock)).toHaveLength(1);

    resolvePost(jsonResponse(201, { application: makeApplication(3, { company: 'Acme', position: 'Engineer' }) }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('backend field-level errors appear beside the matching inputs', async () => {
    const { user } = setup({
      'GET /api/applications': () => pageResponse([]),
      'POST /api/applications': () =>
        jsonResponse(400, {
          status: 'error',
          message: 'Validation failed: deadline must be a valid date in YYYY-MM-DD or ISO 8601 format. jobUrl must be a valid http or https URL.',
          errors: {
            deadline: 'deadline must be a valid date in YYYY-MM-DD or ISO 8601 format.',
            jobUrl: 'jobUrl must be a valid http or https URL.',
          },
        }),
    });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Engineer');
    await user.type(dialog.getByLabelText('Job posting URL'), 'https://acme.example');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    expect(await dialog.findByText('Job posting URL must be a valid http or https URL.')).toBeInTheDocument();
    expect(dialog.getByLabelText('Job posting URL')).toHaveAccessibleDescription('Job posting URL must be a valid http or https URL.');
    expect(dialog.getByLabelText('Deadline')).toHaveAccessibleDescription('Deadline must be a valid date in YYYY-MM-DD or ISO 8601 format.');
    expect(dialog.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // stays open
  });

  test('backend errors for fields the form does not show are displayed in the alert', async () => {
    const { user } = setup({
      'GET /api/applications': () => pageResponse([]),
      'POST /api/applications': () =>
        jsonResponse(400, { status: 'error', message: 'Validation failed: Unknown field: salary.', errors: { salary: 'Unknown field: salary.' } }),
    });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Engineer');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Unknown field: salary.');
  });

  test('a network failure while saving keeps the form open with a readable error', async () => {
    const { user } = setup({
      'GET /api/applications': () => pageResponse([]),
      'POST /api/applications': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Engineer');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Unable to reach the server');
    expect(dialog.getByLabelText(/^Company/)).toHaveValue('Acme');
    expect(dialog.getByRole('button', { name: 'Save application' })).toBeEnabled();
  });

  test('an expired session while saving ends the session and returns to login', async () => {
    const { user } = setup({
      'GET /api/applications': () => pageResponse([]),
      'POST /api/applications': () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }),
    });
    await screen.findByText('No applications yet');
    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Acme');
    await user.type(dialog.getByLabelText(/^Position/), 'Engineer');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(readStoredSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dashboard integration
// ---------------------------------------------------------------------------
describe('Dashboard integration', () => {
  test('the dashboard opens the same form; success shows a toast and refreshes the statistics', async () => {
    const stored = [makeApplication(1, { status: 'Applied' })];
    const { fetchMock, user } = setup(
      {
        'POST /api/applications': ({ body }) => {
          const created = makeApplication(8, body);
          stored.unshift(created);
          return jsonResponse(201, { application: created });
        },
        'GET /api/applications': ({ url }) => {
          const params = new URL(url).searchParams;
          const page = Number(params.get('page'));
          const limit = Number(params.get('limit'));
          return pageResponse(stored.slice((page - 1) * limit, page * limit), { page, limit, total: stored.length });
        },
      },
      '/dashboard'
    );
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    await waitFor(() => expect(screen.getByTestId('stat-total')).toHaveTextContent('Total applications1'));

    const dialog = within(await openForm(user));
    await user.type(dialog.getByLabelText(/^Company/), 'Globex');
    await user.type(dialog.getByLabelText(/^Position/), 'Analyst');
    await user.selectOptions(dialog.getByLabelText('Status'), 'Interviewing');
    await user.click(dialog.getByRole('button', { name: 'Save application' }));

    const toastRegion = screen.getByRole('region', { name: 'Notifications' });
    expect(await within(toastRegion).findByText('Application added')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('stat-total')).toHaveTextContent('Total applications2'));
    expect(screen.getByTestId('stat-interviews')).toHaveTextContent('Interviews1');
    expect(listCalls(fetchMock).length).toBeGreaterThanOrEqual(2);

    await user.click(within(toastRegion).getByRole('link', { name: 'View applications' }));
    await waitFor(() => expect(currentPath()).toBe('/applications'));
    expect(await within(await screen.findByTestId('applications-table')).findByText('Analyst')).toBeInTheDocument();
  });

  test('the dashboard links to the Applications page', async () => {
    const { user } = setup({ 'GET /api/applications': () => pageResponse([], { limit: 100 }) }, '/dashboard');
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    await user.click(screen.getByRole('link', { name: 'View applications' }));
    await waitFor(() => expect(currentPath()).toBe('/applications'));
  });
});

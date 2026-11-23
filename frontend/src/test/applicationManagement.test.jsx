import { describe, expect, test } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentPath, jsonResponse, mockFetch, readStoredSession, renderApp, storeSession, testUser } from './helpers';
import { formatDate } from '../utils/formatters';
import { computeStats } from '../utils/applicationStats';
import { fetchAllApplications } from '../services/applicationService';

// ---------------------------------------------------------------------------
// A small in-memory backend that follows the real API contract
// ---------------------------------------------------------------------------
const hexId = (n) => n.toString(16).padStart(24, '0');
const OPTIONAL = ['location', 'jobUrl', 'applicationDate', 'deadline', 'followUpDate', 'notes'];

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

function createBackend(initial = []) {
  const store = [...initial]; // newest first, like the backend
  const calls = [];
  const notFound = () => jsonResponse(404, { status: 'error', message: 'Application not found.' });
  const find = (id) => store.find((a) => a.id === id);
  const toIso = (value) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);

  const routes = {
    'GET /api/auth/me': () => jsonResponse(200, { user: testUser }),
    'GET /api/applications': ({ url }) => {
      const params = new URL(url).searchParams;
      const page = Number(params.get('page'));
      const limit = Number(params.get('limit'));
      calls.push(`list page=${page} limit=${limit}`);
      const total = store.length;
      const totalPages = Math.ceil(total / limit);
      return jsonResponse(200, {
        applications: store.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    },
    // The dashboard's Top priorities card; these tests don't cover it (see priorities.test.jsx).
    'GET /api/applications/priorities': () =>
      jsonResponse(200, { applications: [], pagination: { page: 1, limit: 3, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } }),
    'GET /api/applications/:id': ({ params }) => {
      calls.push(`get ${params.id}`);
      const application = find(params.id);
      return application ? jsonResponse(200, { application }) : notFound();
    },
    'PATCH /api/applications/:id': ({ params, body }) => {
      calls.push(`patch ${params.id} ${JSON.stringify(body)}`);
      const application = find(params.id);
      if (!application) return notFound();
      for (const [field, value] of Object.entries(body)) {
        if (OPTIONAL.includes(field) && (value === null || value === '')) delete application[field];
        else application[field] = field.endsWith('Date') || field === 'deadline' ? toIso(value) : value;
      }
      application.updatedAt = '2026-11-12T09:30:00.000Z';
      return jsonResponse(200, { application });
    },
    'DELETE /api/applications/:id': ({ params }) => {
      calls.push(`delete ${params.id}`);
      const index = store.findIndex((a) => a.id === params.id);
      if (index === -1) return notFound();
      store.splice(index, 1);
      return new Response(null, { status: 204 });
    },
  };
  return { store, calls, routes };
}

function setup(backend, path = '/applications', overrides = {}) {
  storeSession({ token: 'valid.jwt.token' });
  const fetchMock = mockFetch({ ...backend.routes, ...overrides });
  const user = userEvent.setup();
  renderApp(path);
  return { fetchMock, user };
}

const table = () => screen.getByTestId('applications-table');
const rowFor = (position) => within(table()).getByText(position).closest('tr');
const toasts = () => screen.getByRole('region', { name: 'Notifications' });

async function openDetails(user, position) {
  await screen.findByTestId('applications-table');
  await user.click(within(rowFor(position)).getByRole('button', { name: new RegExp(`^${position} at .*: view details$`) }));
  return screen.findByRole('dialog');
}

async function openEdit(user, position) {
  await screen.findByTestId('applications-table');
  await user.click(within(rowFor(position)).getByRole('button', { name: new RegExp(`^Edit ${position} at`) }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit application' });
  await within(dialog).findByLabelText(/^Company/); // loaded
  return within(dialog);
}

async function openDelete(user, position) {
  await screen.findByTestId('applications-table');
  await user.click(within(rowFor(position)).getByRole('button', { name: new RegExp(`^Delete ${position} at`) }));
  return within(await screen.findByRole('alertdialog'));
}

const FULL = makeApplication(1, {
  company: 'Microsoft',
  position: 'Software Engineering Intern',
  status: 'Interviewing',
  location: 'Redmond, WA',
  jobUrl: 'https://careers.microsoft.com/',
  applicationDate: '2026-11-11T00:00:00.000Z',
  deadline: '2026-11-30T00:00:00.000Z',
  followUpDate: '2026-11-20T00:00:00.000Z',
  interestLevel: 5,
  notes: 'Referral from Sam.\nAsk about the team.',
});
const MINIMAL = makeApplication(2, { company: 'Acme', position: 'Data Analyst', status: 'Saved', interestLevel: 2 });

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------
describe('application details', () => {
  test('opens from the list, loads GET /:id and shows every field', async () => {
    const backend = createBackend([{ ...FULL }, { ...MINIMAL }]);
    const { user } = setup(backend);
    const sheet = within(await openDetails(user, 'Software Engineering Intern'));

    expect(await sheet.findByRole('heading', { name: 'Software Engineering Intern' })).toBeInTheDocument();
    expect(sheet.getByText('Microsoft')).toBeInTheDocument();
    expect(sheet.getAllByText('Interviewing').length).toBeGreaterThan(0);
    expect(sheet.getByText('Redmond, WA')).toBeInTheDocument();
    const link = sheet.getByRole('link', { name: /careers\.microsoft\.com/ });
    expect(link).toHaveAttribute('href', 'https://careers.microsoft.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(sheet.getByText(formatDate('2026-11-11T00:00:00.000Z'))).toBeInTheDocument();
    expect(sheet.getByText(formatDate('2026-11-30T00:00:00.000Z'))).toBeInTheDocument();
    expect(sheet.getByText(formatDate('2026-11-20T00:00:00.000Z'))).toBeInTheDocument();
    expect(sheet.getByText('Interest 5 of 5 (Very high)')).toBeInTheDocument();
    expect(sheet.getByText(/Referral from Sam\./)).toHaveClass('whitespace-pre-wrap');
    expect(sheet.getByText('Created')).toBeInTheDocument();
    expect(sheet.getByText('Last updated')).toBeInTheDocument();
    expect(backend.calls).toContain(`get ${FULL.id}`);
  });

  test('missing optional fields are shown as "Not set"', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const sheet = within(await openDetails(user, 'Data Analyst'));
    await sheet.findByRole('heading', { name: 'Data Analyst' });

    // location, job posting, three dates, notes
    expect(sheet.getAllByText('Not set')).toHaveLength(6);
    expect(sheet.queryByRole('link')).not.toBeInTheDocument();
    expect(sheet.getByText('Interest 2 of 5 (Low)')).toBeInTheDocument();
  });

  test('Escape closes the details and returns focus to the list', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    await openDetails(user, 'Data Analyst');
    await screen.findByRole('heading', { name: 'Data Analyst', level: 2 });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(rowFor('Data Analyst')).getByRole('button', { name: /view details/ })).toHaveFocus();
  });

  test('an application deleted elsewhere shows "not found" and refreshes the list', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    await screen.findByTestId('applications-table');
    backend.store.length = 0; // deleted in another tab

    const sheet = within(await openDetails(user, 'Data Analyst'));
    expect(await sheet.findByText('Application not found')).toBeInTheDocument();
    expect(within(toasts()).getByText('Application not found')).toBeInTheDocument();
    await waitFor(() => expect(backend.calls.filter((c) => c.startsWith('list')).length).toBe(2));
  });
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------
describe('editing', () => {
  test('pre-fills the latest values and sends only the changed fields', async () => {
    const backend = createBackend([{ ...FULL }]);
    const { user } = setup(backend);
    const form = await openEdit(user, 'Software Engineering Intern');

    expect(form.getByLabelText(/^Company/)).toHaveValue('Microsoft');
    expect(form.getByLabelText(/^Position/)).toHaveValue('Software Engineering Intern');
    expect(form.getByLabelText('Status')).toHaveValue('Interviewing');
    expect(form.getByLabelText('Location')).toHaveValue('Redmond, WA');
    expect(form.getByLabelText('Job posting URL')).toHaveValue('https://careers.microsoft.com/');
    expect(form.getByLabelText('Application date')).toHaveValue('2026-11-11');
    expect(form.getByLabelText('Deadline')).toHaveValue('2026-11-30');
    expect(form.getByLabelText('Follow-up date')).toHaveValue('2026-11-20');
    expect(form.getByRole('radio', { name: '5 – Very high' })).toBeChecked();
    expect(form.getByLabelText('Notes')).toHaveValue('Referral from Sam.\nAsk about the team.');

    // Status update + one more change.
    await user.selectOptions(form.getByLabelText('Status'), 'Offer');
    await user.clear(form.getByLabelText(/^Position/));
    await user.type(form.getByLabelText(/^Position/), 'Software Engineer');
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patch = backend.calls.find((c) => c.startsWith('patch'));
    expect(JSON.parse(patch.slice(patch.indexOf('{')))).toEqual({ position: 'Software Engineer', status: 'Offer' });

    expect(within(toasts()).getByText('Changes saved')).toBeInTheDocument();
    await waitFor(() => expect(within(rowFor('Software Engineer')).getByText('Offer')).toHaveClass('text-green-800'));
  });

  test('clearing optional fields sends null so the backend removes them', async () => {
    const backend = createBackend([{ ...FULL }]);
    const { user } = setup(backend);
    const form = await openEdit(user, 'Software Engineering Intern');

    await user.clear(form.getByLabelText('Location'));
    await user.clear(form.getByLabelText('Job posting URL'));
    fireEvent.change(form.getByLabelText('Deadline'), { target: { value: '' } });
    await user.clear(form.getByLabelText('Notes'));
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patch = backend.calls.find((c) => c.startsWith('patch'));
    expect(JSON.parse(patch.slice(patch.indexOf('{')))).toEqual({ location: null, jobUrl: null, deadline: null, notes: null });
    expect(backend.store[0].location).toBeUndefined();
    expect(backend.store[0].deadline).toBeUndefined();
    expect(backend.store[0].applicationDate).toBe('2026-11-11T00:00:00.000Z'); // untouched
  });

  test('saving without changes sends nothing and explains why', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const form = await openEdit(user, 'Data Analyst');
    await user.click(form.getByRole('button', { name: 'Save changes' }));
    expect(form.getByRole('status')).toHaveTextContent("You haven't changed anything yet.");
    expect(backend.calls.some((c) => c.startsWith('patch'))).toBe(false);
  });

  test('required fields cannot be emptied (client validation)', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const form = await openEdit(user, 'Data Analyst');
    await user.clear(form.getByLabelText(/^Company/));
    await user.click(form.getByRole('button', { name: 'Save changes' }));
    expect(form.getByLabelText(/^Company/)).toHaveAccessibleDescription('Company is required.');
    expect(backend.calls.some((c) => c.startsWith('patch'))).toBe(false);
  });

  test('backend field-level errors are shown beside the inputs', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend, '/applications', {
      'PATCH /api/applications/:id': () =>
        jsonResponse(400, {
          status: 'error',
          message: 'Validation failed: location must be at most 200 characters.',
          errors: { location: 'location must be at most 200 characters.' },
        }),
    });
    const form = await openEdit(user, 'Data Analyst');
    await user.type(form.getByLabelText('Location'), 'Somewhere');
    await user.click(form.getByRole('button', { name: 'Save changes' }));
    expect(await form.findByText('Location must be at most 200 characters.')).toBeInTheDocument();
    expect(form.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
  });

  test('editing preserves the current page', async () => {
    const backend = createBackend(Array.from({ length: 12 }, (_, i) => makeApplication(i + 1)));
    const { user } = setup(backend, '/applications?page=2');
    await screen.findByText('Page 2 of 2');
    const form = await openEdit(user, 'Role 11');
    await user.selectOptions(form.getByLabelText('Status'), 'Rejected');
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(within(rowFor('Role 11')).getByText('Rejected')).toBeInTheDocument());
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(backend.calls.filter((c) => c.startsWith('list'))).toEqual(['list page=2 limit=10', 'list page=2 limit=10']);
  });

  test('an application deleted before editing shows "not found"', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    await screen.findByTestId('applications-table');
    backend.store.length = 0;
    await user.click(within(rowFor('Data Analyst')).getByRole('button', { name: /^Edit Data Analyst/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit application' }));
    expect(await dialog.findByText('Application not found')).toBeInTheDocument();
    expect(dialog.queryByLabelText(/^Company/)).not.toBeInTheDocument();
  });

  test('an application deleted while the form is open shows "not found" on save', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const form = await openEdit(user, 'Data Analyst');
    backend.store.length = 0;
    await user.type(form.getByLabelText('Location'), 'Remote');
    await user.click(form.getByRole('button', { name: 'Save changes' }));
    expect(await form.findByText('Application not found')).toBeInTheDocument();
    expect(within(toasts()).getByText('Application not found')).toBeInTheDocument();
  });

  test('an expired session during save returns to login', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend, '/applications', {
      'PATCH /api/applications/:id': () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }),
    });
    const form = await openEdit(user, 'Data Analyst');
    await user.type(form.getByLabelText('Location'), 'Remote');
    await user.click(form.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(readStoredSession()).toBeNull();
  });

  test('Edit is also available from the details view', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const sheet = within(await openDetails(user, 'Data Analyst'));
    await user.click(await sheet.findByRole('button', { name: 'Edit' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit application' }));
    expect(await dialog.findByLabelText(/^Company/)).toHaveValue('Acme');
  });
});

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------
describe('deleting', () => {
  test('asks for confirmation naming the application, then deletes (204) and refreshes', async () => {
    const backend = createBackend([{ ...FULL }, { ...MINIMAL }]);
    const { user } = setup(backend);
    const confirm = await openDelete(user, 'Data Analyst');

    expect(screen.getByRole('alertdialog', { name: 'Delete this application?' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(/Data Analyst at Acme will be permanently deleted\. This can't be undone\./);
    expect(confirm.getByRole('button', { name: 'Cancel' })).toHaveFocus(); // safe default

    await user.click(confirm.getByRole('button', { name: 'Delete application' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(backend.calls).toContain(`delete ${MINIMAL.id}`);
    expect(within(toasts()).getByText('Application deleted')).toBeInTheDocument();
    await waitFor(() => expect(within(table()).queryByText('Data Analyst')).not.toBeInTheDocument());
    expect(screen.getByTestId('application-count')).toHaveTextContent('1 application');
  });

  test('cancelling (button or Escape) deletes nothing', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    let confirm = await openDelete(user, 'Data Analyst');
    await user.click(confirm.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    confirm = await openDelete(user, 'Data Analyst');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(backend.calls.some((c) => c.startsWith('delete'))).toBe(false);
    expect(within(table()).getByText('Data Analyst')).toBeInTheDocument();
  });

  test('buttons are disabled while the request is processing', async () => {
    let resolveDelete;
    const backend = createBackend([{ ...MINIMAL }]);
    const { user, fetchMock } = setup(backend, '/applications', {
      'DELETE /api/applications/:id': () => new Promise((resolve) => (resolveDelete = resolve)),
    });
    const confirm = await openDelete(user, 'Data Analyst');
    await user.click(confirm.getByRole('button', { name: 'Delete application' }));

    expect(confirm.getByRole('button', { name: /Deleting/ })).toBeDisabled();
    expect(confirm.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument(); // can't be dismissed mid-request
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1);

    resolveDelete(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  test('deleting the only item on the last page moves back a page', async () => {
    const backend = createBackend(Array.from({ length: 11 }, (_, i) => makeApplication(i + 1)));
    const { user } = setup(backend, '/applications?page=2');
    await screen.findByText('Page 2 of 2');
    const confirm = await openDelete(user, 'Role 11');
    await user.click(confirm.getByRole('button', { name: 'Delete application' }));

    await waitFor(() => expect(screen.getByText('Page 1 of 1')).toBeInTheDocument());
    expect(backend.calls.filter((c) => c.startsWith('list'))).toEqual(['list page=2 limit=10', 'list page=1 limit=10']);
  });

  test('deleting the very last application shows the empty state', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const confirm = await openDelete(user, 'Data Analyst');
    await user.click(confirm.getByRole('button', { name: 'Delete application' }));
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });

  test('an application already deleted elsewhere (404) is reported and the list refreshed', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const confirm = await openDelete(user, 'Data Analyst');
    backend.store.length = 0;
    await user.click(confirm.getByRole('button', { name: 'Delete application' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(within(toasts()).getByText('Application not found')).toBeInTheDocument();
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });

  test('a network failure keeps the dialog open with an error', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend, '/applications', {
      'DELETE /api/applications/:id': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const confirm = await openDelete(user, 'Data Analyst');
    await user.click(confirm.getByRole('button', { name: 'Delete application' }));
    expect(await confirm.findByRole('alert')).toHaveTextContent('Unable to reach the server');
    expect(confirm.getByRole('button', { name: 'Delete application' })).toBeEnabled();
    expect(within(table()).getByText('Data Analyst')).toBeInTheDocument();
  });

  test('an expired session during delete returns to login', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend, '/applications', {
      'DELETE /api/applications/:id': () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }),
    });
    const confirm = await openDelete(user, 'Data Analyst');
    await user.click(confirm.getByRole('button', { name: 'Delete application' }));
    await waitFor(() => expect(currentPath()).toBe('/login'));
  });

  test('Delete is also available from the details view', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    const sheet = within(await openDetails(user, 'Data Analyst'));
    await user.click(await sheet.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alertdialog', { name: 'Delete this application?' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dashboard statistics
// ---------------------------------------------------------------------------
describe('dashboard statistics', () => {
  const statText = (key) => screen.getByTestId(`stat-${key}`).querySelector('dd span').textContent;

  test('category definitions: In progress = Applied + Interviewing', () => {
    const apps = ['Saved', 'Applied', 'Applied', 'Interviewing', 'Offer', 'Rejected'].map((status, i) => makeApplication(i + 1, { status }));
    expect(computeStats(apps)).toEqual({ total: 6, inProgress: 3, interviews: 1, offers: 1 });
    expect(computeStats([])).toEqual({ total: 0, inProgress: 0, interviews: 0, offers: 0 });
  });

  test('shows real counts for the signed-in user', async () => {
    const statuses = ['Saved', 'Applied', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
    const backend = createBackend(statuses.map((status, i) => makeApplication(i + 1, { status })));
    setup(backend, '/dashboard');

    await waitFor(() => expect(statText('total')).toBe('6'));
    expect(statText('inProgress')).toBe('3');
    expect(statText('interviews')).toBe('1');
    expect(statText('offers')).toBe('1');
    expect(screen.getByTestId('stat-inProgress')).toHaveTextContent('Applied or Interviewing');

    const recent = screen.getByRole('region', { name: 'Recent applications' });
    expect(within(recent).getAllByRole('listitem')).toHaveLength(3);
    expect(within(recent).getByText("You're tracking 6 applications. Here are the latest.")).toBeInTheDocument();
  });

  test('statistics cover every page, fetched sequentially (not just the first page)', async () => {
    const statuses = ['Applied', 'Interviewing', 'Offer', 'Saved', 'Rejected'];
    const all = Array.from({ length: 230 }, (_, i) => makeApplication(i + 1, { status: statuses[i % 5] }));
    const backend = createBackend(all);
    let inFlight = 0;
    let maxInFlight = 0;
    const listRoute = backend.routes['GET /api/applications'];
    setup(backend, '/dashboard', {
      'GET /api/applications': async (request) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return listRoute(request);
      },
    });

    await waitFor(() => expect(statText('total')).toBe('230'));
    expect(statText('inProgress')).toBe('92'); // 46 Applied + 46 Interviewing
    expect(statText('interviews')).toBe('46');
    expect(statText('offers')).toBe('46');
    expect(backend.calls).toEqual(['list page=1 limit=100', 'list page=2 limit=100', 'list page=3 limit=100']);
    expect(maxInFlight).toBe(1);
  });

  test('the page loop is bounded; the total stays exact and a note explains the limit', async () => {
    const { calls, routes } = createBackend([]);
    // A huge account: every page reports more to come.
    const fetchMock = mockFetch({
      'GET /api/applications': ({ url }) => {
        const page = Number(new URL(url).searchParams.get('page'));
        calls.push(page);
        return jsonResponse(200, {
          applications: Array.from({ length: 100 }, (_, i) => makeApplication(page * 1000 + i, { status: 'Offer' })),
          pagination: { page, limit: 100, total: 5000, totalPages: 50, hasNextPage: true, hasPrevPage: page > 1 },
        });
      },
    });
    const result = await fetchAllApplications();
    expect(calls).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result).toMatchObject({ total: 5000, complete: false });
    expect(result.applications).toHaveLength(1000);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(routes).toBeDefined();
  });

  test('an empty account shows zeros and an empty state with Add application', async () => {
    const backend = createBackend([]);
    const { user } = setup(backend, '/dashboard');
    await waitFor(() => expect(statText('total')).toBe('0'));
    const empty = screen.getByRole('region', { name: 'No applications yet' });
    await user.click(within(empty).getByRole('button', { name: 'Add your first application' }));
    expect(await screen.findByRole('dialog', { name: 'Add application' })).toBeInTheDocument();
  });

  test('a network failure shows an error with retry; no numbers are invented', async () => {
    const backend = createBackend([makeApplication(1)]);
    let fail = true;
    const listRoute = backend.routes['GET /api/applications'];
    const { user } = setup(backend, '/dashboard', {
      'GET /api/applications': (request) => {
        if (fail) throw new TypeError('Failed to fetch');
        return listRoute(request);
      },
    });
    const overview = await screen.findByRole('region', { name: 'Overview' });
    expect(await within(overview).findByRole('alert')).toHaveTextContent("Couldn't load your statistics");
    expect(screen.queryByTestId('stat-total')).not.toBeInTheDocument();

    fail = false;
    await user.click(within(overview).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(statText('total')).toBe('1'));
  });

  test('an expired session while loading statistics returns to login', async () => {
    const backend = createBackend([]);
    setup(backend, '/dashboard', {
      'GET /api/applications': () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }),
    });
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(readStoredSession()).toBeNull();
  });
});

describe('focus management', () => {
  test('closing the Add, Edit and Delete dialogs returns focus to the button that opened them', async () => {
    const backend = createBackend([{ ...MINIMAL }]);
    const { user } = setup(backend);
    await screen.findByTestId('applications-table');

    const addButton = screen.getByRole('button', { name: 'Add application' });
    await user.click(addButton);
    await screen.findByRole('dialog', { name: 'Add application' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(addButton).toHaveFocus());

    const editButton = within(rowFor('Data Analyst')).getByRole('button', { name: /^Edit Data Analyst/ });
    await user.click(editButton);
    await screen.findByRole('dialog', { name: 'Edit application' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(editButton).toHaveFocus());

    const deleteButton = within(rowFor('Data Analyst')).getByRole('button', { name: /^Delete Data Analyst/ });
    await user.click(deleteButton);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(deleteButton).toHaveFocus());
  });
});

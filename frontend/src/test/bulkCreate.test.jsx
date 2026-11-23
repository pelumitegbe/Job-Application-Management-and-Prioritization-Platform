import { describe, expect, test } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentPath, jsonResponse, mockFetch, readStoredSession, renderApp, storeSession, testUser } from './helpers';

const hexId = (n) => n.toString(16).padStart(24, '0');
let nextId = 1;

/** Backend-like POST /api/applications: echoes the body as a created application. */
function created(body) {
  return jsonResponse(201, {
    application: {
      id: hexId(nextId++),
      user: testUser.id,
      status: 'Saved',
      interestLevel: 3,
      createdAt: '2026-11-23T12:00:00.000Z',
      updatedAt: '2026-11-23T12:00:00.000Z',
      ...body,
    },
  });
}

const emptyList = () =>
  jsonResponse(200, { applications: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } });

function setup(postHandler = ({ body }) => created(body), path = '/applications/bulk') {
  storeSession({ token: 'valid.jwt.token' });
  const posted = [];
  const fetchMock = mockFetch({
    'GET /api/auth/me': () => jsonResponse(200, { user: testUser }),
    'GET /api/applications': emptyList,
    'POST /api/applications': (request) => {
      posted.push(request.body);
      return postHandler(request, posted.length);
    },
  });
  const user = userEvent.setup();
  renderApp(path);
  return { user, posted, fetchMock };
}

const row = (n) => within(screen.getByTestId(`bulk-row-${n}`));
const rows = () => screen.getAllByTestId(/^bulk-row-/);
const submitButton = () => screen.getByRole('button', { name: /^(Create|Retry) \d+ applications?$/ });

async function fill(user, n, { company, position, ...rest } = {}) {
  const r = row(n);
  if (company) await user.type(r.getByLabelText(/^Company/), company);
  if (position) await user.type(r.getByLabelText(/^Position/), position);
  if (rest.status) await user.selectOptions(r.getByLabelText('Status'), rest.status);
  if (rest.interestLevel) await user.selectOptions(r.getByLabelText('Interest level'), String(rest.interestLevel));
  if (rest.location) await user.type(r.getByLabelText('Location'), rest.location);
  if (rest.jobUrl) await user.type(r.getByLabelText('Job posting URL'), rest.jobUrl);
  for (const field of ['applicationDate', 'deadline', 'followUpDate']) {
    const label = { applicationDate: 'Application date', deadline: 'Deadline', followUpDate: 'Follow-up date' }[field];
    if (rest[field]) fireEvent.change(r.getByLabelText(label), { target: { value: rest[field] } });
  }
  if (rest.notes) await user.type(r.getByLabelText('Notes'), rest.notes);
}

async function fillThree(user) {
  await fill(user, 1, { company: 'Acme', position: 'Engineer' });
  await fill(user, 2, { company: 'Globex', position: 'Analyst' });
  await fill(user, 3, { company: 'Initech', position: 'Designer' });
}

describe('bulk entry interface', () => {
  test('opens from the Applications page via "Add multiple" (single "Add application" is kept)', async () => {
    const { user } = setup(undefined, '/applications');
    await screen.findByText('No applications yet');
    expect(screen.getAllByRole('button', { name: 'Add application' }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('link', { name: 'Add multiple' }));
    await waitFor(() => expect(currentPath()).toBe('/applications/bulk'));
    expect(screen.getByRole('heading', { name: 'Add multiple applications', level: 2 })).toBeInTheDocument();
  });

  test('starts with three numbered, empty rows with every field and default values', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    expect(rows()).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole('group', { name: `Application ${n}` })).toBeInTheDocument();
      const r = row(n);
      expect(r.getByLabelText(/^Company/)).toBeRequired();
      expect(r.getByLabelText(/^Position/)).toBeRequired();
      expect(r.getByLabelText('Status')).toHaveValue('Saved');
      expect(r.getByLabelText('Interest level')).toHaveValue('3');
      for (const label of ['Location', 'Application date', 'Deadline', 'Follow-up date', 'Job posting URL', 'Notes']) {
        expect(r.getByLabelText(label)).not.toBeRequired();
      }
      expect(r.getByLabelText('Deadline')).toHaveAttribute('type', 'date');
    }
    expect(submitButton()).toHaveTextContent('Create 3 applications');
  });

  test('adds rows (up to 20) and focuses the new row', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    const add = screen.getByRole('button', { name: 'Add another' });

    await user.click(add);
    expect(rows()).toHaveLength(4);
    await waitFor(() => expect(row(4).getByLabelText(/^Company/)).toHaveFocus());

    for (let i = 0; i < 16; i += 1) await user.click(add);
    expect(rows()).toHaveLength(20);
    expect(add).toBeDisabled();
    expect(screen.getByText('20 of 20 rows')).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Create 20 applications');
  });

  test('removes rows, renumbers them, and always keeps at least one', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fill(user, 3, { company: 'Third' });

    await user.click(screen.getByRole('button', { name: 'Remove application 1' }));
    expect(rows()).toHaveLength(2);
    expect(row(2).getByLabelText(/^Company/)).toHaveValue('Third'); // was row 3

    await user.click(screen.getByRole('button', { name: 'Remove application 1' }));
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove application 1' })).toBeDisabled();
  });

  test('responsive layout: stacked cards with a 1/2/4-column field grid, no wide table', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const grid = row(1).getByLabelText(/^Company/).closest('.grid');
    expect(grid).toHaveClass('grid', 'sm:grid-cols-2', 'lg:grid-cols-4');
    expect(row(1).getByLabelText('Job posting URL').closest('.flex-col')).toHaveClass('sm:col-span-2');
  });
});

describe('validation', () => {
  test('every row is validated; nothing is sent while any row is invalid (empty rows are not skipped)', async () => {
    const { user, posted } = setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fill(user, 1, { company: 'Acme', position: 'Engineer' });
    await fill(user, 3, { company: 'Initech' }); // missing position

    await user.click(submitButton());

    expect(posted).toHaveLength(0);
    expect(screen.getByText(/Fix the highlighted fields in 2 applications before submitting\. Nothing has been created yet\./)).toBeInTheDocument();
    expect(row(2).getByLabelText(/^Company/)).toHaveAccessibleDescription('Company is required.');
    expect(row(2).getByLabelText(/^Position/)).toHaveAccessibleDescription('Position is required.');
    expect(row(3).getByLabelText(/^Position/)).toHaveAccessibleDescription('Position is required.');
    expect(row(1).getByLabelText(/^Company/)).not.toHaveAttribute('aria-invalid');
    expect(row(2).getByLabelText(/^Company/)).toHaveFocus(); // first invalid field
  });

  test('validates URLs, dates and lengths per row with the single-form rules', async () => {
    const { user, posted } = setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fill(user, 1, { company: 'Acme', position: 'Engineer', jobUrl: 'acme.example/jobs' });
    await fill(user, 2, { company: 'Globex', position: 'Analyst' });
    fireEvent.change(row(2).getByLabelText('Deadline'), { target: { value: '2026-02-30' } });
    await user.click(screen.getByRole('button', { name: 'Remove application 3' }));
    await user.click(submitButton());

    expect(row(1).getByLabelText('Job posting URL')).toHaveAccessibleDescription('Enter a full URL starting with http:// or https://.');
    expect(posted).toHaveLength(0);
  });

  test('"Remove empty rows" clears untouched rows', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fill(user, 2, { company: 'Only one' });
    await user.click(screen.getByRole('button', { name: 'Remove empty rows' }));
    expect(rows()).toHaveLength(1);
    expect(row(1).getByLabelText(/^Company/)).toHaveValue('Only one');
    expect(screen.queryByRole('button', { name: 'Remove empty rows' })).not.toBeInTheDocument();
  });

  test('editing a field clears its error', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await user.click(submitButton());
    expect(row(1).getByLabelText(/^Company/)).toHaveAttribute('aria-invalid', 'true');
    await user.type(row(1).getByLabelText(/^Company/), 'A');
    expect(row(1).getByLabelText(/^Company/)).not.toHaveAttribute('aria-invalid');
  });
});

describe('submission', () => {
  test('sends one valid application with the exact backend field names', async () => {
    const { user, posted } = setup();
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await user.click(screen.getByRole('button', { name: 'Remove application 3' }));
    await user.click(screen.getByRole('button', { name: 'Remove application 2' }));
    await fill(user, 1, {
      company: ' Microsoft ',
      position: 'SWE Intern',
      status: 'Applied',
      interestLevel: 5,
      location: 'Redmond, WA',
      jobUrl: 'https://careers.microsoft.com/',
      applicationDate: '2026-11-20',
      deadline: '2026-11-30',
      followUpDate: '2026-11-27',
      notes: 'Referral',
    });
    await user.click(submitButton());

    await screen.findByText('All 1 application created');
    expect(posted).toEqual([
      {
        company: 'Microsoft',
        position: 'SWE Intern',
        status: 'Applied',
        interestLevel: 5,
        location: 'Redmond, WA',
        jobUrl: 'https://careers.microsoft.com/',
        applicationDate: '2026-11-20',
        deadline: '2026-11-30',
        followUpDate: '2026-11-27',
        notes: 'Referral',
      },
    ]);
  });

  test('creates several applications sequentially with progress, then summarizes', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const resolvers = [];
    const { user, posted } = setup(({ body }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => resolvers.push(() => {
        inFlight -= 1;
        resolve(created(body));
      }));
    });
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fillThree(user);
    await user.click(submitButton());

    for (const n of [1, 2, 3]) {
      expect(await screen.findByText(`Creating ${n} of 3 applications…`)).toBeInTheDocument();
      expect(row(n).getByText('Creating…')).toBeInTheDocument();
      await waitFor(() => expect(resolvers).toHaveLength(n));
      resolvers[n - 1]();
    }

    expect(await screen.findByText('All 3 applications created')).toBeInTheDocument();
    expect(maxInFlight).toBe(1);
    expect(posted.map((b) => b.company)).toEqual(['Acme', 'Globex', 'Initech']);
    for (const n of [1, 2, 3]) expect(row(n).getByText('Created')).toBeInTheDocument();

    const toasts = screen.getByRole('region', { name: 'Notifications' });
    expect(within(toasts).getByText('3 applications added')).toBeInTheDocument();

    // The page footer (the toast offers the same link).
    const footerLink = screen.getAllByRole('link', { name: 'View applications' }).find((link) => !toasts.contains(link));
    await user.click(footerLink);
    await waitFor(() => expect(currentPath()).toBe('/applications'));
  });

  test('partial failure: successes are kept, failures show errors beside the row and field', async () => {
    const { user, posted } = setup(({ body }, count) =>
      count === 2
        ? jsonResponse(400, {
            status: 'error',
            message: 'Validation failed: location must be at most 200 characters.',
            errors: { location: 'location must be at most 200 characters.' },
          })
        : created(body)
    );
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fillThree(user);
    await user.click(submitButton());

    expect(await screen.findByText('2 created, 1 not created')).toBeInTheDocument();
    expect(posted).toHaveLength(3); // a failure doesn't stop the batch
    expect(row(1).getByText('Created')).toBeInTheDocument();
    expect(row(3).getByText('Created')).toBeInTheDocument();
    expect(row(2).getByText('Not created')).toBeInTheDocument();
    expect(row(2).getByRole('alert')).toHaveTextContent('The server rejected some fields. Fix them and retry.');
    expect(row(2).getByLabelText('Location')).toHaveAccessibleDescription('Location must be at most 200 characters.');
    expect(row(2).getByLabelText(/^Company/)).toHaveValue('Globex'); // values preserved
    expect(submitButton()).toHaveTextContent('Retry 1 application');
  });

  test('retry sends only the failed rows; created applications are never resubmitted', async () => {
    let failNext = true;
    const { user, posted } = setup(({ body }) => {
      if (body.company === 'Globex' && failNext) {
        failNext = false;
        throw new TypeError('Failed to fetch'); // network failure for row 2 on the first attempt
      }
      return created(body);
    });
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fillThree(user);
    await user.click(submitButton());

    expect(await screen.findByText('2 created, 1 not created')).toBeInTheDocument();
    expect(row(2).getByRole('alert')).toHaveTextContent('Unable to reach the server');

    await user.click(submitButton()); // "Retry 1 application"
    expect(await screen.findByText('All 1 application created')).toBeInTheDocument();
    expect(posted.map((b) => b.company)).toEqual(['Acme', 'Globex', 'Initech', 'Globex']);
    for (const n of [1, 2, 3]) expect(row(n).getByText('Created')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Create|Retry)/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a new batch' })).toBeInTheDocument();
  });

  test('prevents duplicate submissions while processing', async () => {
    const resolvers = [];
    const { user, posted } = setup(({ body }) => new Promise((resolve) => resolvers.push(() => resolve(created(body)))));
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fillThree(user);

    await user.click(submitButton());
    const busy = await screen.findByRole('button', { name: /Creating 1 of 3/ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    fireEvent.submit(busy.closest('form'));
    expect(screen.getByRole('button', { name: 'Add another' })).toBeDisabled();
    expect(row(2).getByLabelText(/^Company/)).toBeDisabled();

    for (let i = 0; i < 3; i += 1) {
      await waitFor(() => expect(resolvers.length).toBeGreaterThan(i));
      resolvers[i]();
    }
    await screen.findByText('All 3 applications created');
    expect(posted).toHaveLength(3);
  });

  test('an expired session stops the batch and returns to login', async () => {
    const { user, posted } = setup(({ body }, count) =>
      count === 2 ? jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }) : created(body)
    );
    await screen.findByRole('heading', { name: 'Add multiple applications', level: 2 });
    await fillThree(user);
    await user.click(submitButton());

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(posted).toHaveLength(2); // row 3 was never sent
    expect(readStoredSession()).toBeNull();
  });

  test('/applications/bulk requires authentication', async () => {
    const fetchMock = mockFetch({});
    renderApp('/applications/bulk');
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentPath, jsonResponse, mockFetch, readStoredSession, renderApp, storeSession, testUser } from './helpers';
import { fetchAllPriorities } from '../services/applicationService';
import { filterPriorities, mostRelevantExplanation, summarizePriorities, urgencyIndicators } from '../utils/priorityInsights';

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Fixtures in the backend's response shape. Scores and factors are given, not
// computed: the frontend must display them as-is.
// ---------------------------------------------------------------------------

const CATEGORY_FOR = (score) => (score >= 75 ? 'Critical' : score >= 50 ? 'High' : score >= 25 ? 'Medium' : score >= 1 ? 'Low' : 'No action');

function makeItem(n, { score = 40, status = 'Applied', deadline = {}, followUp = {}, interestLevel = 3, nextActionDate = null, explanations } = {}) {
  const rejected = status === 'Rejected';
  const factors = {
    deadline: { score: 0, weight: 0.4, contribution: 0, explanation: 'No deadline set.', daysUntil: null, expired: false, applies: false, ...deadline },
    followUp: { score: 0, weight: 0.25, contribution: 0, explanation: 'No follow-up date set.', daysUntil: null, overdue: false, ...followUp },
    stage: { score: 60, weight: 0.2, contribution: 12, explanation: `${status}: stage weighting applied.` },
    interest: { score: 50, weight: 0.15, contribution: 7.5, explanation: `Interest level ${interestLevel} of 5.`, level: interestLevel },
  };
  return {
    id: `app${String(n).padStart(4, '0')}`,
    company: `Company ${n}`,
    position: `Role ${n}`,
    status,
    interestLevel,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    priority: {
      score: rejected ? 0 : score,
      category: rejected ? 'No action' : CATEGORY_FOR(score),
      rawScore: rejected ? 19.5 : score,
      ...(rejected && { override: 'Rejected applications always score 0.' }),
      factors,
      explanations: explanations ?? (rejected ? ['Rejected: no further action needed.'] : [factors.stage.explanation]),
      nextActionDate,
    },
  };
}

/** `ranked` is the backend ranking (already sorted). Rejected are excluded unless includeRejected=true. */
function createBackend(ranked) {
  const calls = [];
  const routes = {
    'GET /api/auth/me': () => jsonResponse(200, { user: testUser }),
    'GET /api/applications': () =>
      jsonResponse(200, { applications: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } }),
    'GET /api/applications/priorities': ({ url }) => {
      const params = new URL(url).searchParams;
      const page = Number(params.get('page'));
      const limit = Number(params.get('limit') || 20);
      const includeRejected = params.get('includeRejected') === 'true';
      calls.push(`priorities page=${page} limit=${limit}${includeRejected ? ' includeRejected' : ''}`);
      const eligible = includeRejected ? ranked : ranked.filter((a) => a.status !== 'Rejected');
      const total = eligible.length;
      const totalPages = Math.ceil(total / limit);
      return jsonResponse(200, {
        applications: eligible.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
        scoring: { formula: 'P = 0.40D + 0.25F + 0.20S + 0.15I', referenceDate: '2026-11-23', timezone: 'UTC', includeRejected },
      });
    },
    'GET /api/applications/:id': ({ params }) => {
      calls.push(`get ${params.id}`);
      const item = ranked.find((a) => a.id === params.id);
      if (!item) return jsonResponse(404, { status: 'error', message: 'Application not found.' });
      const { priority: _priority, ...application } = item;
      return jsonResponse(200, { application });
    },
  };
  return { calls, routes };
}

function setup(backend, path = '/priorities', overrides = {}) {
  storeSession({ token: 'valid.jwt.token' });
  const fetchMock = mockFetch({ ...backend.routes, ...overrides });
  const user = userEvent.setup();
  renderApp(path);
  return { fetchMock, user };
}

/** n non-rejected items with descending scores (90, 87, ...). */
const rankedItems = (n, start = 1) => Array.from({ length: n }, (_, i) => makeItem(start + i, { score: Math.max(1, 90 - i * 3) }));

const list = () => screen.findByTestId('priority-list');
const items = () => within(screen.getByTestId('priority-list')).getAllByTestId('priority-item');
const ranksShown = () => items().map((li) => within(li).getByTestId('priority-rank').textContent.replace('Rank ', ''));
const summaryValue = (key) => within(screen.getByTestId(`summary-${key}`)).getByRole('definition').textContent.match(/^\d+/)?.[0];

// ---------------------------------------------------------------------------

describe('Priorities page: ranked list', () => {
  test('renders the backend ranking in order with rank, company, position, status, score, category, interest and next action', async () => {
    const ranked = [
      makeItem(1, { score: 84, status: 'Saved', interestLevel: 5, nextActionDate: '2026-11-25', deadline: { score: 90, contribution: 36, explanation: 'Deadline in 2 days.', daysUntil: 2, applies: true } }),
      makeItem(2, { score: 58, status: 'Interviewing' }),
      makeItem(3, { score: 30, status: 'Applied' }),
      makeItem(4, { score: 10, status: 'Offer', interestLevel: 1 }),
    ];
    setup(createBackend(ranked));
    await list();

    expect(ranksShown()).toEqual(['#1', '#2', '#3', '#4']);
    const first = items()[0];
    expect(within(first).getByText('Role 1')).toBeInTheDocument();
    expect(within(first).getByText('Company 1')).toBeInTheDocument();
    expect(within(first).getByText('Saved')).toBeInTheDocument();
    expect(within(first).getByTestId('category-badge')).toHaveTextContent('Critical');
    expect(within(first).getByText('Priority score 84 out of 100')).toBeInTheDocument();
    expect(within(first).getByText('Interest 5 of 5 (Very high)')).toBeInTheDocument();
    expect(within(first).getByText(/Next action:/)).toHaveTextContent('Next action: Nov 25, 2026');
    // The most relevant explanation is the strongest time-based factor.
    expect(within(first).getByTestId('priority-explanation')).toHaveTextContent('Deadline in 2 days.');
    // Without time pressure, the stage explanation is shown.
    expect(within(items()[1]).getByTestId('priority-explanation')).toHaveTextContent('Interviewing: stage weighting applied.');
    expect(within(items()[1]).getByText(/Next action:/)).toHaveTextContent('Next action: None');
  });

  test('score visualization is readable without colour: the number is printed and the bar matches it', async () => {
    setup(createBackend([makeItem(1, { score: 76 })]));
    await list();
    const meter = within(items()[0]).getByTestId('score-meter');
    expect(meter).toHaveTextContent('76/100');
    expect(within(meter).getByText('Priority score 76 out of 100')).toHaveClass('sr-only');
    expect(meter.querySelector('[style]')).toHaveStyle({ width: '76%' });
  });

  test('categories are named and colour coded (Critical red, High orange, Medium blue, Low gray, No action muted)', async () => {
    const ranked = [makeItem(1, { score: 80 }), makeItem(2, { score: 60 }), makeItem(3, { score: 30 }), makeItem(4, { score: 5 }), makeItem(5, { score: 0 })];
    setup(createBackend(ranked));
    await list();
    const badges = items().map((li) => within(li).getByTestId('category-badge'));
    expect(badges.map((b) => b.textContent)).toEqual(['Critical', 'High', 'Medium', 'Low', 'No action']);
    expect(badges[0]).toHaveClass('text-red-700');
    expect(badges[1]).toHaveClass('text-orange-800');
    expect(badges[2]).toHaveClass('text-blue-700');
    expect(badges[3]).toHaveClass('text-gray-700');
    expect(badges[4]).toHaveClass('text-gray-600');
  });

  test('urgency warnings: an overdue follow-up stays visible on a Medium item; due today, upcoming and expired deadlines', async () => {
    const ranked = [
      makeItem(1, { score: 40, followUp: { score: 100, contribution: 25, explanation: 'Follow-up overdue by 3 days.', daysUntil: -3, overdue: true } }),
      makeItem(2, { score: 35, followUp: { score: 90, contribution: 22.5, explanation: 'Follow-up due today.', daysUntil: 0 } }),
      makeItem(3, { score: 55, status: 'Saved', deadline: { score: 70, contribution: 28, explanation: 'Deadline in 5 days.', daysUntil: 5, applies: true } }),
      makeItem(4, { score: 10, status: 'Saved', deadline: { score: 0, contribution: 0, explanation: 'Deadline passed 2 days ago.', daysUntil: -2, expired: true, applies: true } }),
    ];
    setup(createBackend(ranked));
    await list();
    const [overdue, today, soon, expired] = items();
    expect(within(overdue).getByTestId('category-badge')).toHaveTextContent('Medium');
    expect(within(overdue).getByTestId('urgency-follow-up-overdue')).toHaveTextContent('Follow-up overdue by 3 days');
    expect(within(overdue).getByTestId('urgency-follow-up-overdue')).toHaveClass('text-red-700');
    expect(within(today).getByTestId('urgency-follow-up-today')).toHaveTextContent('Follow-up due today');
    expect(within(soon).getByTestId('urgency-deadline-soon')).toHaveTextContent('Deadline in 5 days');
    expect(within(expired).getByTestId('urgency-deadline-expired')).toHaveTextContent('Deadline passed');
    expect(within(expired).getByTestId('priority-explanation')).toHaveTextContent('Deadline passed 2 days ago.');
  });
});

describe('Priorities page: summary cards', () => {
  test('counts cover the whole ranking (every backend page), not the visible page', async () => {
    const ranked = [
      ...rankedItems(12), // scores 90..57: six Critical (90-75), six High (72-57)
      makeItem(100, { score: 40, followUp: { score: 100, contribution: 25, explanation: 'Follow-up overdue by 1 day.', daysUntil: -1, overdue: true } }),
      makeItem(101, { score: 30, status: 'Saved', deadline: { score: 60, contribution: 24, explanation: 'Deadline in 7 days.', daysUntil: 7, applies: true } }),
      makeItem(102, { score: 20, status: 'Saved', deadline: { score: 30, contribution: 12, explanation: 'Deadline in 8 days.', daysUntil: 8, applies: true } }),
      makeItem(103, { score: 20, status: 'Applied', deadline: { score: 0, contribution: 0, explanation: 'Deadline no longer applies.', daysUntil: 2, applies: false } }),
      makeItem(104, { status: 'Rejected', followUp: { daysUntil: -5, overdue: true } }),
    ];
    setup(createBackend(ranked));
    await list();
    expect(items()).toHaveLength(10); // the visible page
    expect(summaryValue('actionable')).toBe('16'); // 17 minus the rejected one
    expect(summaryValue('highPriority')).toBe('12');
    expect(summaryValue('overdueFollowUps')).toBe('1'); // the rejected overdue one is not actionable
    expect(summaryValue('upcomingDeadlines')).toBe('1'); // Saved, 0-7 days; 8 days and non-Saved excluded
  });

  test('the full ranking is read sequentially, 100 at a time, including rejected applications', async () => {
    const backend = createBackend(rankedItems(150));
    let inFlight = 0;
    let maxInFlight = 0;
    const route = backend.routes['GET /api/applications/priorities'];
    setup(backend, '/priorities', {
      'GET /api/applications/priorities': async (request) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return route(request);
      },
    });
    await list();
    await waitFor(() => expect(summaryValue('actionable')).toBe('150'));
    expect(backend.calls).toEqual(['priorities page=1 limit=100 includeRejected', 'priorities page=2 limit=100 includeRejected']);
    expect(maxInFlight).toBe(1);
  });

  test('fetchAllPriorities is bounded and reports an incomplete ranking', async () => {
    const pages = [];
    mockFetch({
      'GET /api/applications/priorities': ({ url }) => {
        const page = Number(new URL(url).searchParams.get('page'));
        pages.push(page);
        return jsonResponse(200, {
          applications: Array.from({ length: 100 }, (_, i) => makeItem(page * 1000 + i)),
          pagination: { page, limit: 100, total: 5000, totalPages: 50, hasNextPage: true, hasPrevPage: page > 1 },
          scoring: { referenceDate: '2026-11-23' },
        });
      },
    });
    const result = await fetchAllPriorities();
    expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result).toMatchObject({ total: 5000, complete: false, referenceDate: '2026-11-23' });
    expect(result.items).toHaveLength(1000);
    expect(result.items[999].rank).toBe(1000);
  });

  test('a malformed priorities response is reported as an error', async () => {
    setup(createBackend([]), '/priorities', { 'GET /api/applications/priorities': () => jsonResponse(200, { applications: [{ id: 'x' }], pagination: {} }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('The server returned an unexpected response.');
  });
});

describe('Priorities page: breakdown', () => {
  const scored = () =>
    makeItem(1, {
      score: 76,
      status: 'Saved',
      nextActionDate: '2026-11-24',
      deadline: { score: 95, contribution: 38, explanation: 'Deadline tomorrow.', daysUntil: 1, applies: true },
      followUp: { score: 80, contribution: 20, explanation: 'Follow-up due in 1 day.', daysUntil: 1 },
      explanations: ['Deadline tomorrow.', 'Follow-up due in 1 day.', 'Saved: stage weighting applied.'],
    });

  test('selecting an item shows score, category, each factor with weighted contribution, the explanations and the formula', async () => {
    const item = scored();
    item.priority.rawScore = 77.5; // 38 + 20 + 12 + 7.5, as the backend reports it
    const { user } = setup(createBackend([item, makeItem(2, { score: 20 })]));
    await list();
    await user.click(screen.getByRole('button', { name: 'Role 1 at Company 1: view priority breakdown' }));

    const sheet = await screen.findByRole('dialog', { name: 'Role 1' });
    expect(within(sheet).getByText('Priority breakdown · Rank #1')).toBeInTheDocument();
    expect(within(sheet).getByText('Priority score 76 out of 100')).toBeInTheDocument();
    expect(within(sheet).getAllByTestId('category-badge')[0]).toHaveTextContent('Critical');
    expect(within(sheet).getByTestId('priority-formula')).toHaveTextContent('P = 0.40D + 0.25F + 0.20S + 0.15I');

    const row = (key) => within(sheet).getByTestId(`factor-${key}`);
    expect(row('deadline')).toHaveTextContent(/Deadline urgency \(D\)\s*95\/100\s*40%\s*38/);
    expect(row('followUp')).toHaveTextContent(/Follow-up urgency \(F\)\s*80\/100\s*25%\s*20/);
    expect(row('stage')).toHaveTextContent(/Application stage \(S\)\s*60\/100\s*20%\s*12/);
    expect(row('interest')).toHaveTextContent(/Interest level \(I\)\s*50\/100\s*15%\s*7\.5/);
    expect(within(sheet).getByTestId('factor-table')).toHaveTextContent('Total (rounded to score)77.5');

    const explanations = within(within(sheet).getByTestId('priority-explanations')).getAllByRole('listitem');
    expect(explanations.map((li) => li.textContent)).toEqual(['Deadline tomorrow.', 'Follow-up due in 1 day.', 'Saved: stage weighting applied.']);
    expect(within(sheet).getByText(/Dates compared with Nov 23, 2026, today in UTC/)).toBeInTheDocument();
  });

  test('a rejected application explains the override', async () => {
    const { user } = setup(createBackend([makeItem(1, { score: 50 }), makeItem(2, { status: 'Rejected' })]), '/priorities?rejected=1');
    await list();
    await user.click(screen.getByRole('button', { name: 'Role 2 at Company 2: view priority breakdown' }));
    const sheet = await screen.findByRole('dialog', { name: 'Role 2' });
    expect(within(sheet).getByTestId('priority-override')).toHaveTextContent('Rejected applications always score 0.');
    expect(within(sheet).getByTestId('factor-table')).toHaveTextContent('Total (before override)19.5');
  });

  test('the breakdown opens the existing application details sheet', async () => {
    const backend = createBackend([scored()]);
    const { user } = setup(backend);
    await list();
    await user.click(screen.getByRole('button', { name: 'Role 1 at Company 1: view priority breakdown' }));
    await user.click(await screen.findByRole('button', { name: 'Open application details' }));

    const details = await screen.findByRole('dialog', { name: 'Role 1' });
    expect(await within(details).findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(backend.calls).toContain('get app0001');
    expect(screen.queryByText(/Priority breakdown/)).not.toBeInTheDocument();
  });
});

describe('Priorities page: filters and pagination', () => {
  test('category filter applies to the whole ranking and keeps global ranks; summary cards do not change', async () => {
    // 23 items: ranks 1-6 Critical, 7-14 High, 15-23 Medium/Low.
    const ranked = rankedItems(23);
    const { user } = setup(createBackend(ranked));
    await list();
    const before = summaryValue('highPriority');

    await user.selectOptions(screen.getByLabelText('Category'), 'High');
    await waitFor(() => expect(ranksShown()).toEqual(['#7', '#8', '#9', '#10', '#11', '#12', '#13', '#14']));
    expect(items().every((li) => within(li).getByTestId('category-badge').textContent === 'High')).toBe(true);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Showing 1–8 of 8');
    expect(summaryValue('highPriority')).toBe(before);

    await user.selectOptions(screen.getByLabelText('Category'), 'Medium');
    // Medium items sit on the 2nd and 3rd backend-ranked pages; all of them are found.
    await waitFor(() => expect(ranksShown()).toEqual(['#15', '#16', '#17', '#18', '#19', '#20', '#21', '#22']));
  });

  test('status filter, and rejected applications only appear when "Include rejected" is checked', async () => {
    const ranked = [makeItem(1, { score: 60, status: 'Interviewing' }), makeItem(2, { score: 40, status: 'Applied' }), makeItem(3, { score: 20, status: 'Interviewing' }), makeItem(4, { status: 'Rejected' })];
    const { user } = setup(createBackend(ranked));
    await list();
    expect(ranksShown()).toEqual(['#1', '#2', '#3']);
    const status = screen.getByLabelText('Status');
    expect(within(status).queryByRole('option', { name: 'Rejected' })).not.toBeInTheDocument();

    await user.selectOptions(status, 'Interviewing');
    await waitFor(() => expect(ranksShown()).toEqual(['#1', '#3']));
    await user.selectOptions(status, '');

    await user.click(screen.getByRole('checkbox', { name: 'Include rejected' }));
    await waitFor(() => expect(ranksShown()).toEqual(['#1', '#2', '#3', '#4']));
    const rejected = items()[3];
    expect(within(rejected).getByTestId('category-badge')).toHaveTextContent('No action');
    expect(within(rejected).getByTestId('priority-explanation')).toHaveTextContent('Rejected: no further action needed.');
    expect(summaryValue('actionable')).toBe('3');

    await user.selectOptions(screen.getByLabelText('Status'), 'Rejected');
    await waitFor(() => expect(ranksShown()).toEqual(['#4']));
    // Unchecking clears a Rejected status filter.
    await user.click(screen.getByRole('checkbox', { name: 'Include rejected' }));
    await waitFor(() => expect(ranksShown()).toEqual(['#1', '#2', '#3']));
    expect(screen.getByLabelText('Status')).toHaveValue('');
  });

  test('filters live in the URL and can be reset', async () => {
    const { user } = setup(createBackend(rankedItems(23)), '/priorities?category=Critical');
    await list();
    expect(screen.getByLabelText('Category')).toHaveValue('Critical');
    expect(ranksShown()).toEqual(['#1', '#2', '#3', '#4', '#5', '#6']);
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(items()).toHaveLength(10));
    expect(screen.getByLabelText('Category')).toHaveValue('');
  });

  test('pagination shows correct totals and global ranks on every page', async () => {
    const { user } = setup(createBackend(rankedItems(23)));
    await list();
    const nav = () => screen.getByRole('navigation', { name: 'Pagination' });
    expect(nav()).toHaveTextContent('Showing 1–10 of 23');
    expect(nav()).toHaveTextContent('Page 1 of 3');
    expect(within(nav()).getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(within(nav()).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(ranksShown()[0]).toBe('#11'));
    expect(ranksShown()).toHaveLength(10);
    expect(nav()).toHaveTextContent('Showing 11–20 of 23');

    await user.click(within(nav()).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(ranksShown()).toEqual(['#21', '#22', '#23']));
    expect(nav()).toHaveTextContent('Page 3 of 3');
    expect(within(nav()).getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  test('a page past the end shows the last page', async () => {
    setup(createBackend(rankedItems(12)), '/priorities?page=9');
    await list();
    await waitFor(() => expect(ranksShown()).toEqual(['#11', '#12']));
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Page 2 of 2');
  });
});

describe('Priorities page: states', () => {
  test('loading state while the ranking is fetched', async () => {
    let release;
    const backend = createBackend(rankedItems(2));
    const route = backend.routes['GET /api/applications/priorities'];
    setup(backend, '/priorities', {
      'GET /api/applications/priorities': (request) => new Promise((resolve) => (release = () => resolve(route(request)))),
    });
    expect(await screen.findByText('Loading priorities…')).toBeInTheDocument();
    release();
    await list();
    expect(screen.queryByText('Loading priorities…')).not.toBeInTheDocument();
  });

  test('empty state when there are no applications', async () => {
    setup(createBackend([]));
    expect(await screen.findByText('No applications to prioritise')).toBeInTheDocument();
    expect(summaryValue('actionable')).toBe('0');
    expect(screen.queryByRole('search', { name: 'Filter priorities' })).not.toBeInTheDocument();
  });

  test('filtered empty state when nothing matches', async () => {
    setup(createBackend(rankedItems(3)), '/priorities?category=Low');
    expect(await screen.findByTestId('priorities-filtered-empty')).toHaveTextContent('No applications match these filters');
  });

  test('a server error shows a message and "Try again" reloads', async () => {
    let fail = true;
    const backend = createBackend(rankedItems(2));
    const route = backend.routes['GET /api/applications/priorities'];
    const { user } = setup(backend, '/priorities', {
      'GET /api/applications/priorities': (request) => (fail ? jsonResponse(500, { status: 'error', message: 'Internal server error.' }) : route(request)),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('The server had a problem loading your priorities. Please try again.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await list();
    expect(items()).toHaveLength(2);
  });

  test('an unauthorized response ends the session and returns to login', async () => {
    setup(createBackend([]), '/priorities', { 'GET /api/applications/priorities': () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }) });
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(screen.getByRole('alert')).toHaveTextContent('Your session is no longer valid. Please log in again.');
    expect(readStoredSession()).toBeNull();
  });

  test('/priorities requires authentication', async () => {
    const fetchMock = mockFetch({});
    renderApp('/priorities');
    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('responsive layout: cards stack on mobile and use columns from md; summary is 2-up then 4-up; mobile nav links to Priorities', async () => {
    const { user } = setup(createBackend(rankedItems(2)));
    await list();
    expect(items()[0].className).toMatch(/grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
    expect(items()[0].className).toMatch(/md:grid-cols-\[auto_minmax\(0,1fr\)_13rem_auto\]/);
    const summaryGrid = screen.getByTestId('summary-actionable').parentElement;
    expect(summaryGrid).toHaveClass('grid-cols-2', 'lg:grid-cols-4');

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const mobileNav = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(mobileNav).getByRole('link', { name: 'Priorities' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Dashboard: Top priorities', () => {
  test('shows the top 3 actionable applications from one request, and links to /priorities', async () => {
    const ranked = [
      makeItem(1, { score: 84, followUp: { score: 100, contribution: 25, explanation: 'Follow-up overdue by 2 days.', daysUntil: -2, overdue: true } }),
      makeItem(2, { score: 58 }),
      makeItem(3, { score: 40 }),
      makeItem(4, { score: 30 }),
    ];
    const backend = createBackend(ranked);
    const { user } = setup(backend, '/dashboard');

    const card = await screen.findByRole('region', { name: 'Top priorities' });
    const top = await within(card).findByTestId('top-priorities');
    expect(top.children).toHaveLength(3);
    const first = top.children[0];
    expect(first).toHaveTextContent('Role 1');
    expect(first).toHaveTextContent('Company 1');
    expect(within(first).getByText('Priority score 84 out of 100')).toBeInTheDocument();
    expect(within(first).getByTestId('category-badge')).toHaveTextContent('Critical');
    expect(within(first).getByTestId('urgency-follow-up-overdue')).toBeInTheDocument();
    expect(first).toHaveTextContent('Follow-up overdue by 2 days.');
    expect(backend.calls).toEqual(['priorities page=1 limit=3']); // no includeRejected: actionable only

    // Existing statistics are still on the dashboard.
    expect(screen.getByRole('region', { name: 'Overview' })).toBeInTheDocument();

    await user.click(within(card).getByRole('link', { name: 'View all priorities' }));
    await waitFor(() => expect(currentPath()).toBe('/priorities'));
  });

  test('shows an error with retry when priorities fail to load', async () => {
    let fail = true;
    const backend = createBackend([makeItem(1, { score: 70 })]);
    const route = backend.routes['GET /api/applications/priorities'];
    const { user } = setup(backend, '/dashboard', {
      'GET /api/applications/priorities': (request) => (fail ? jsonResponse(503, { status: 'error', message: 'Service unavailable.' }) : route(request)),
    });
    const card = await screen.findByRole('region', { name: 'Top priorities' });
    expect(await within(card).findByRole('alert')).toHaveTextContent("Couldn't load priorities");
    fail = false;
    await user.click(within(card).getByRole('button', { name: 'Try again' }));
    expect(await within(card).findByText('Role 1')).toBeInTheDocument();
  });
});

describe('priority insight helpers (no score is recalculated)', () => {
  test('urgencyIndicators reads the backend factor details', () => {
    expect(urgencyIndicators(makeItem(1, { followUp: { daysUntil: -1, overdue: true } })).map((i) => i.label)).toEqual(['Follow-up overdue by 1 day']);
    expect(urgencyIndicators(makeItem(1, { status: 'Saved', deadline: { daysUntil: 0, applies: true } })).map((i) => i.key)).toEqual(['deadline-today']);
    expect(urgencyIndicators(makeItem(1, { status: 'Applied', deadline: { daysUntil: 2, applies: false } }))).toEqual([]);
    expect(urgencyIndicators(makeItem(1, { status: 'Rejected', followUp: { daysUntil: -1, overdue: true } }))).toEqual([]);
  });

  test('mostRelevantExplanation prefers the largest time-based contribution', () => {
    const item = makeItem(1, {
      deadline: { contribution: 10, explanation: 'Deadline in 6 days.', daysUntil: 6, applies: true },
      followUp: { contribution: 22.5, explanation: 'Follow-up due today.', daysUntil: 0 },
    });
    expect(mostRelevantExplanation(item)).toBe('Follow-up due today.');
  });

  test('summarizePriorities and filterPriorities', () => {
    const all = [makeItem(1, { score: 80 }), makeItem(2, { score: 55, status: 'Saved' }), makeItem(3, { status: 'Rejected' })];
    expect(summarizePriorities(all)).toEqual({ actionable: 2, highPriority: 2, overdueFollowUps: 0, upcomingDeadlines: 0 });
    expect(filterPriorities(all, {}).map((a) => a.id)).toEqual(['app0001', 'app0002']);
    expect(filterPriorities(all, { includeRejected: true, status: 'Rejected' }).map((a) => a.id)).toEqual(['app0003']);
    expect(filterPriorities(all, { category: 'High' }).map((a) => a.id)).toEqual(['app0002']);
  });
});

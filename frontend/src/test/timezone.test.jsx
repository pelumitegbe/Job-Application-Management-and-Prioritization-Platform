import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, renderApp, storeSession, testUser } from './helpers';
import { calendarDateInTimeZone, detectBrowserTimeZone, isValidTimeZone, listTimeZones, nextLocalMidnight } from '../utils/timezone';
import { MIDNIGHT_GRACE_MS, usePriorityAutoRefresh } from '../hooks/usePriorityAutoRefresh';
import { notifyApplicationsChanged, onApplicationsChanged } from '../services/applicationEvents';
import { createApplication, deleteApplication, fetchAllPriorities, updateApplication } from '../services/applicationService';
import { formatDate } from '../utils/formatters';
import { toDateInputValue } from '../utils/applicationForm';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

const HOUR = 60 * 60 * 1000;
const at = (iso) => new Date(iso);

// ---------------------------------------------------------------------------
// Fake backend: priorities are "scored" for the calendar date of the (fake)
// current time in the user's saved time zone, like the real endpoint.
// ---------------------------------------------------------------------------
function makeItem(n, { score = 40, status = 'Applied', followUp = {}, deadline = {} } = {}) {
  return {
    id: `app${n}`,
    company: `Company ${n}`,
    position: `Role ${n}`,
    status,
    interestLevel: 3,
    priority: {
      score,
      category: score >= 75 ? 'Critical' : score >= 50 ? 'High' : score >= 25 ? 'Medium' : score >= 1 ? 'Low' : 'No action',
      rawScore: score,
      factors: {
        deadline: { score: 0, weight: 0.4, contribution: 0, explanation: 'No application deadline is set.', daysUntil: null, expired: false, applies: false, ...deadline },
        followUp: { score: 0, weight: 0.25, contribution: 0, explanation: 'No follow-up date is set.', daysUntil: null, overdue: false, ...followUp },
        stage: { score: 60, weight: 0.2, contribution: 12, explanation: 'Application has been submitted.' },
        interest: { score: 60, weight: 0.15, contribution: 9, explanation: 'Interest level is 3 out of 5.', level: 3 },
      },
      explanations: ['Application has been submitted.'],
      nextActionDate: null,
    },
  };
}

function createBackend({ user = { ...testUser, timezone: 'America/Chicago', timezoneSource: 'user' }, items = [makeItem(1)] } = {}) {
  const state = { user: { ...user }, items, calls: [], patches: [] };
  const priorities = ({ url }) => {
    const params = new URL(url).searchParams;
    const limit = Number(params.get('limit') || 20);
    const referenceDate = calendarDateInTimeZone(new Date(), state.user.timezone);
    state.calls.push(`priorities ${referenceDate} ${state.user.timezone} limit=${limit}`);
    return jsonResponse(200, {
      applications: state.items.slice(0, limit),
      pagination: { page: 1, limit, total: state.items.length, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      scoring: { formula: 'P = 0.40D + 0.25F + 0.20S + 0.15I', referenceDate, timezone: state.user.timezone, includeRejected: params.get('includeRejected') === 'true' },
    });
  };
  state.routes = {
    'GET /api/auth/me': () => jsonResponse(200, { user: state.user }),
    'PATCH /api/auth/me': ({ body }) => {
      state.patches.push(body);
      if (body.timezone === 'Bad/Zone') return jsonResponse(400, { status: 'error', message: 'Validation failed: timezone must be a valid IANA time zone identifier.', errors: { timezone: 'timezone must be a valid IANA time zone identifier.' } });
      state.user = { ...state.user, timezone: body.timezone, timezoneSource: 'user' };
      return jsonResponse(200, { user: state.user });
    },
    'GET /api/applications': () => jsonResponse(200, { applications: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } }),
    'GET /api/applications/priorities': priorities,
  };
  return state;
}

/** With fake timers, RTL's waitFor can't poll; advance the fake clock and flush promises instead. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

function useFakeClock(iso) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: Date.parse(iso) });
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

// ---------------------------------------------------------------------------
describe('time zone utilities', () => {
  test('detects the browser time zone with Intl', () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/Chicago' });
    expect(detectBrowserTimeZone()).toBe('America/Chicago');
    spy.mockReturnValue({ timeZone: undefined });
    expect(detectBrowserTimeZone()).toBeNull();
  });

  test('validates IANA names and lists UTC first', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    for (const bad of ['Mars/Base', '+05:00', '', null, 'America/Chicago; x']) expect(isValidTimeZone(bad)).toBe(false);
    const zones = listTimeZones();
    expect(zones[0]).toBe('UTC');
    expect(zones).toContain('America/Los_Angeles');
    expect(zones).toContain('Asia/Tokyo');
  });

  test('calendar date in a time zone', () => {
    const instant = at('2026-11-24T03:30:00.000Z');
    expect(calendarDateInTimeZone(instant, 'UTC')).toBe('2026-11-24');
    expect(calendarDateInTimeZone(instant, 'America/Chicago')).toBe('2026-11-23');
    expect(calendarDateInTimeZone(instant, 'America/New_York')).toBe('2026-11-23');
    expect(calendarDateInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-11-23');
    expect(calendarDateInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-11-24');
  });

  test('next local midnight on ordinary days', () => {
    expect(nextLocalMidnight(at('2026-11-23T12:00:00.000Z'), 'UTC').toISOString()).toBe('2026-11-24T00:00:00.000Z');
    expect(nextLocalMidnight(at('2026-11-23T12:00:00.000Z'), 'America/Chicago').toISOString()).toBe('2026-11-24T06:00:00.000Z');
    expect(nextLocalMidnight(at('2026-11-23T12:00:00.000Z'), 'America/Los_Angeles').toISOString()).toBe('2026-11-24T08:00:00.000Z');
    expect(nextLocalMidnight(at('2026-11-23T12:00:00.000Z'), 'Asia/Tokyo').toISOString()).toBe('2026-11-23T15:00:00.000Z');
    expect(nextLocalMidnight(at('2026-11-23T12:00:00.000Z'), 'Asia/Kolkata').toISOString()).toBe('2026-11-23T18:30:00.000Z');
  });

  test('daylight saving: days of 23 and 25 hours', () => {
    // Chicago spring forward (Sun Mar 8 2026): the day from midnight to midnight is 23 hours.
    const marchStart = nextLocalMidnight(at('2026-03-07T18:00:00.000Z'), 'America/Chicago');
    expect(marchStart.toISOString()).toBe('2026-03-08T06:00:00.000Z');
    const marchEnd = nextLocalMidnight(marchStart, 'America/Chicago');
    expect(marchEnd.toISOString()).toBe('2026-03-09T05:00:00.000Z');
    expect(marchEnd - marchStart).toBe(23 * HOUR);
    // Fall back (Sun Nov 1 2026): 25 hours.
    const novStart = nextLocalMidnight(at('2026-10-31T18:00:00.000Z'), 'America/Chicago');
    const novEnd = nextLocalMidnight(novStart, 'America/Chicago');
    expect(novEnd - novStart).toBe(25 * HOUR);
    expect(novEnd.toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  test('a skipped midnight (DST starting at 00:00) gives the first instant of the new day', () => {
    // Chile moves clocks from 00:00 to 01:00 in early September; the local date still changes once.
    const start = at('2026-09-05T12:00:00.000Z');
    const next = nextLocalMidnight(start, 'America/Santiago');
    expect(calendarDateInTimeZone(new Date(next.getTime() - 1), 'America/Santiago')).toBe(calendarDateInTimeZone(start, 'America/Santiago'));
    expect(calendarDateInTimeZone(next, 'America/Santiago')).not.toBe(calendarDateInTimeZone(start, 'America/Santiago'));
  });
});

// ---------------------------------------------------------------------------
describe('usePriorityAutoRefresh', () => {
  beforeEach(() => setVisibility('visible'));

  function setup(props) {
    const refresh = vi.fn();
    const hook = renderHook((p) => usePriorityAutoRefresh({ isLoading: false, hasError: false, loadedAt: 1, refresh, ...p }), { initialProps: props });
    return { refresh, ...hook };
  }

  test('refreshes at the next local midnight (plus a short grace period), then reschedules', () => {
    useFakeClock('2026-11-24T05:00:00.000Z'); // Nov 23, 23:00 in Chicago
    const { refresh, rerender } = setup({ timezone: 'America/Chicago', referenceDate: '2026-11-23' });
    vi.advanceTimersByTime(HOUR - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MIDNIGHT_GRACE_MS + 1);
    expect(refresh).toHaveBeenCalledTimes(1);

    // New data for Nov 24 schedules the following midnight, 24 hours later.
    rerender({ timezone: 'America/Chicago', referenceDate: '2026-11-24', loadedAt: 2 });
    vi.advanceTimersByTime(24 * HOUR - 10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('uses the real length of a daylight-saving day (23 hours on Mar 8 2026 in Chicago)', () => {
    useFakeClock('2026-03-08T06:00:05.000Z'); // Mar 8, 00:00:05 CST
    const { refresh } = setup({ timezone: 'America/Chicago', referenceDate: '2026-03-08' });
    vi.advanceTimersByTime(23 * HOUR - 10_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000); // 00:00:05 CDT + grace
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('a time zone change reschedules the midnight refresh', () => {
    useFakeClock('2026-11-24T04:00:00.000Z'); // 22:00 Chicago, 23:00 New York
    const { refresh, rerender } = setup({ timezone: 'America/Chicago', referenceDate: '2026-11-23' });
    rerender({ timezone: 'America/New_York', referenceDate: '2026-11-23', loadedAt: 2 });
    vi.advanceTimersByTime(HOUR + MIDNIGHT_GRACE_MS); // New York midnight
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('tab visibility: refreshes only when the scoring date has changed', () => {
    useFakeClock('2026-11-23T18:00:00.000Z');
    const { refresh, rerender } = setup({ timezone: 'America/Chicago', referenceDate: '2026-11-23' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).not.toHaveBeenCalled(); // same day

    rerender({ timezone: 'America/Chicago', referenceDate: '2026-11-22' }); // data from yesterday
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).not.toHaveBeenCalled(); // tab hidden
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender({ timezone: 'America/Chicago', referenceDate: '2026-11-22', isLoading: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).toHaveBeenCalledTimes(1); // a refresh is already running
  });

  test('reconnecting: refreshes stale data or a failed load, otherwise does nothing', () => {
    useFakeClock('2026-11-23T18:00:00.000Z');
    const { refresh, rerender } = setup({ timezone: 'UTC', referenceDate: '2026-11-23' });
    window.dispatchEvent(new Event('online'));
    expect(refresh).not.toHaveBeenCalled();
    rerender({ timezone: 'UTC', referenceDate: '2026-11-22' });
    window.dispatchEvent(new Event('online'));
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender({ timezone: 'UTC', referenceDate: '2026-11-23', hasError: true });
    window.dispatchEvent(new Event('online'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('cleans up its timer and listeners on unmount', () => {
    useFakeClock('2026-11-23T23:59:00.000Z');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const { refresh, unmount } = setup({ timezone: 'UTC', referenceDate: '2026-11-22' });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('online', expect.any(Function));
    vi.advanceTimersByTime(HOUR);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('automatic refresh in the app', () => {
  beforeEach(() => setVisibility('visible'));

  test('the Priorities page reloads at local midnight and shows the new scoring date', async () => {
    useFakeClock('2026-11-24T05:59:30.000Z'); // Nov 23, 23:59:30 in Chicago
    const backend = createBackend();
    mockFetch(backend.routes);
    storeSession();
    renderApp('/priorities');
    await flush();
    expect(screen.getByTestId('scoring-date')).toHaveTextContent('Scored for Nov 23, 2026 in America/Chicago');
    expect(backend.calls).toEqual(['priorities 2026-11-23 America/Chicago limit=100']);

    await flush(30_000 + MIDNIGHT_GRACE_MS);
    expect(backend.calls).toEqual(['priorities 2026-11-23 America/Chicago limit=100', 'priorities 2026-11-24 America/Chicago limit=100']);
    expect(screen.getByTestId('scoring-date')).toHaveTextContent('Scored for Nov 24, 2026');

    // No polling: nothing more happens during the day.
    await flush(12 * HOUR);
    expect(backend.calls).toHaveLength(2);
  });

  test('the dashboard Top priorities reload at local midnight with the new day\'s urgency', async () => {
    useFakeClock('2026-11-23T17:59:50.000Z'); // Nov 23, 23:59:50 in Dhaka (UTC+6)
    const backend = createBackend({ user: { ...testUser, timezone: 'Asia/Dhaka', timezoneSource: 'user' } });
    // Like the real engine: a follow-up dated Nov 23 is "due today" on Nov 23 and "overdue" on Nov 24.
    const route = backend.routes['GET /api/applications/priorities'];
    backend.routes['GET /api/applications/priorities'] = (req) => {
      const today = calendarDateInTimeZone(new Date(), 'Asia/Dhaka');
      const overdue = today > '2026-11-23';
      backend.items = [
        makeItem(1, {
          score: 55,
          followUp: {
            score: 100,
            contribution: 25,
            daysUntil: overdue ? -1 : 0,
            overdue,
            explanation: overdue ? 'Follow-up is overdue by 1 day.' : 'Follow-up is due today.',
          },
        }),
      ];
      return route(req);
    };
    mockFetch(backend.routes);
    storeSession();
    renderApp('/dashboard');
    await flush();
    const card = screen.getByRole('region', { name: 'Top priorities' });
    expect(within(card).getByTestId('top-priorities-date')).toHaveTextContent('Scored for Nov 23, 2026 (Asia/Dhaka)');
    expect(card).toHaveTextContent('Follow-up due today');

    await flush(10_000 + MIDNIGHT_GRACE_MS);
    expect(backend.calls).toEqual(['priorities 2026-11-23 Asia/Dhaka limit=3', 'priorities 2026-11-24 Asia/Dhaka limit=3']);
    expect(within(card).getByTestId('top-priorities-date')).toHaveTextContent('Scored for Nov 24, 2026 (Asia/Dhaka)');
    expect(within(card).getByTestId('urgency-follow-up-overdue')).toHaveTextContent('Follow-up overdue by 1 day');
    expect(card).toHaveTextContent('Follow-up is overdue by 1 day.');

    await flush(6 * HOUR);
    expect(backend.calls).toHaveLength(2); // no loop, no polling
  });

  test('leaving the page stops its midnight timer and listeners (no requests after unmount)', async () => {
    useFakeClock('2026-11-23T17:59:00.000Z');
    const backend = createBackend({ user: { ...testUser, timezone: 'Asia/Dhaka', timezoneSource: 'user' } });
    mockFetch(backend.routes);
    storeSession();
    const { unmount } = renderApp('/priorities');
    await flush();
    expect(backend.calls).toHaveLength(1);
    unmount();
    await flush(HOUR);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(backend.calls).toHaveLength(1);
  });

  test('returning to the tab after midnight reloads once; returning on the same day does not', async () => {
    useFakeClock('2026-11-23T18:00:00.000Z');
    const backend = createBackend();
    mockFetch(backend.routes);
    storeSession();
    renderApp('/priorities');
    await flush();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(backend.calls).toHaveLength(1);

    // The computer slept through midnight: the timer hasn't fired yet, but the date has changed.
    vi.setSystemTime(Date.parse('2026-11-24T15:00:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(backend.calls).toEqual(['priorities 2026-11-23 America/Chicago limit=100', 'priorities 2026-11-24 America/Chicago limit=100']);
  });

  test('reconnecting retries a load that failed while offline', async () => {
    useFakeClock('2026-11-23T18:00:00.000Z');
    const backend = createBackend();
    let offline = true;
    mockFetch({ ...backend.routes, 'GET /api/applications/priorities': (req) => (offline ? Promise.reject(new TypeError('Failed to fetch')) : backend.routes['GET /api/applications/priorities'](req)) });
    storeSession();
    renderApp('/priorities');
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/reach the server|network|connect/i);
    offline = false;
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(screen.getByTestId('priority-list')).toBeInTheDocument();
  });

  test('application changes refresh priorities; simultaneous triggers make one request', async () => {
    const backend = createBackend();
    mockFetch({
      ...backend.routes,
      'POST /api/applications': () => jsonResponse(201, { application: { id: 'new', company: 'C', position: 'P', status: 'Saved' } }),
      'PATCH /api/applications/:id': ({ params }) => jsonResponse(200, { application: { id: params.id, company: 'C', position: 'P', status: 'Applied' } }),
      'DELETE /api/applications/:id': () => new Response(null, { status: 204 }),
    });
    storeSession();
    renderApp('/priorities');
    await screen.findByTestId('priority-list');
    expect(backend.calls).toHaveLength(1);

    await act(async () => {
      await createApplication({ company: 'C', position: 'P' });
    });
    await waitFor(() => expect(backend.calls).toHaveLength(2));
    await act(async () => {
      await updateApplication('app1', { status: 'Applied' });
    });
    await waitFor(() => expect(backend.calls).toHaveLength(3));
    await act(async () => {
      await deleteApplication('app1');
    });
    await waitFor(() => expect(backend.calls).toHaveLength(4));

    // Three changes in the same moment (as in bulk creation) -> one refresh.
    act(() => {
      notifyApplicationsChanged({ type: 'created' });
      notifyApplicationsChanged({ type: 'created' });
      notifyApplicationsChanged({ type: 'created' });
    });
    await waitFor(() => expect(backend.calls).toHaveLength(5));
    await new Promise((r) => setTimeout(r, 30));
    expect(backend.calls).toHaveLength(5);
  });

  test('create, update and delete each announce a change (bulk creation reuses create)', async () => {
    mockFetch({
      'POST /api/applications': () => jsonResponse(201, { application: { id: 'a1' } }),
      'PATCH /api/applications/:id': () => jsonResponse(200, { application: { id: 'a1' } }),
      'DELETE /api/applications/:id': () => new Response(null, { status: 204 }),
    });
    const events = [];
    const stop = onApplicationsChanged((change) => events.push(change.type));
    await createApplication({ company: 'C', position: 'P' });
    await updateApplication('a1', { status: 'Offer' });
    await deleteApplication('a1');
    stop();
    await createApplication({ company: 'C', position: 'P' });
    expect(events).toEqual(['created', 'updated', 'deleted']);
  });

  test('a slower, older response never overwrites newer data', async () => {
    const backend = createBackend({ items: [makeItem(1)] }); // "Role 1" before the change
    const resolvers = [];
    mockFetch({
      ...backend.routes,
      // Each response is built from the data at request time, then held until released.
      'GET /api/applications/priorities': (req) => {
        const response = backend.routes['GET /api/applications/priorities'](req);
        return new Promise((resolve) => resolvers.push(() => resolve(response)));
      },
    });
    storeSession();
    renderApp('/priorities');
    await waitFor(() => expect(resolvers).toHaveLength(1)); // old request: Role 1
    backend.items = [makeItem(2, { score: 90 })];
    act(() => notifyApplicationsChanged({ type: 'updated' }));
    await waitFor(() => expect(resolvers).toHaveLength(2)); // new request: Role 2

    resolvers[1]();
    await screen.findByText('Role 2');
    resolvers[0](); // the stale response arrives last
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('Role 2')).toBeInTheDocument();
    expect(screen.queryByText('Role 1')).not.toBeInTheDocument();
  });

  test('fetchAllPriorities restarts once if midnight passes between pages', async () => {
    const dates = ['2026-11-23', '2026-11-24', '2026-11-24', '2026-11-24'];
    let call = 0;
    mockFetch({
      'GET /api/applications/priorities': ({ url }) => {
        const page = Number(new URL(url).searchParams.get('page'));
        const referenceDate = dates[call++];
        return jsonResponse(200, {
          applications: [makeItem(page)],
          pagination: { page, limit: 100, total: 2, totalPages: 2, hasNextPage: page < 2, hasPrevPage: page > 1 },
          scoring: { referenceDate, timezone: 'UTC' },
        });
      },
    });
    const result = await fetchAllPriorities();
    expect(call).toBe(4);
    expect(result).toMatchObject({ referenceDate: '2026-11-24', timezone: 'UTC', consistent: true });
    expect(result.items.map((i) => i.rank)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
describe('time zone preference', () => {
  function detect(zone) {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function resolvedOptions() {
      return { timeZone: zone, locale: 'en-US' };
    });
  }

  test('Settings shows the saved and detected time zones and explains their effect', async () => {
    detect('America/Los_Angeles');
    const backend = createBackend({ user: { ...testUser, timezone: 'America/New_York', timezoneSource: 'user' } });
    mockFetch(backend.routes);
    storeSession();
    renderApp('/settings');
    const card = await screen.findByRole('region', { name: 'Time zone' });
    expect(within(card).getByTestId('current-timezone')).toHaveTextContent('America/New York');
    expect(within(card).getByTestId('detected-timezone')).toHaveTextContent('America/Los Angeles');
    expect(card).toHaveTextContent(/deadline and follow-up urgency/i);
    expect(screen.getByLabelText('Time zone for priorities')).toHaveValue('America/New_York');
    expect(within(card).getByRole('button', { name: 'Save time zone' })).toBeDisabled();
  });

  test('changing the time zone saves it and updates the page', async () => {
    detect('America/Chicago');
    const backend = createBackend({ user: { ...testUser, timezone: 'UTC', timezoneSource: 'user' } });
    mockFetch(backend.routes);
    storeSession();
    const user = userEvent.setup();
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Time zone' });

    await user.click(screen.getByRole('button', { name: 'Use detected time zone' }));
    expect(screen.getByLabelText('Time zone for priorities')).toHaveValue('America/Chicago');
    expect(backend.patches).toEqual([]); // nothing saved until Save
    await user.click(screen.getByRole('button', { name: 'Save time zone' }));

    await waitFor(() => expect(backend.patches).toEqual([{ timezone: 'America/Chicago' }]));
    expect(await screen.findByTestId('current-timezone')).toHaveTextContent('America/Chicago');
    expect(within(screen.getByRole('region', { name: 'Notifications' })).getByText('Time zone saved')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Time zone for priorities'), 'Asia/Tokyo');
    await user.click(screen.getByRole('button', { name: 'Save time zone' }));
    await waitFor(() => expect(backend.patches.at(-1)).toEqual({ timezone: 'Asia/Tokyo' }));
  });

  test('a time zone the server rejects shows its message and keeps the saved value', async () => {
    detect('UTC');
    const backend = createBackend({ user: { ...testUser, timezone: 'UTC', timezoneSource: 'user' } });
    mockFetch({
      ...backend.routes,
      'PATCH /api/auth/me': () =>
        jsonResponse(400, { status: 'error', message: 'Validation failed: timezone must be a valid IANA time zone identifier.', errors: { timezone: 'timezone must be a valid IANA time zone identifier.' } }),
    });
    storeSession();
    const user = userEvent.setup();
    renderApp('/settings');
    await screen.findByRole('region', { name: 'Time zone' });
    await user.selectOptions(screen.getByLabelText('Time zone for priorities'), 'Asia/Tokyo');
    await user.click(screen.getByRole('button', { name: 'Save time zone' }));
    expect(await screen.findByText('timezone must be a valid IANA time zone identifier.')).toBeInTheDocument();
    expect(screen.getByLabelText('Time zone for priorities')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('current-timezone')).toHaveTextContent('UTC');
  });

  test('a default (UTC) account gets a one-time suggestion; nothing is saved without a click', async () => {
    detect('America/Chicago');
    const backend = createBackend({ user: { ...testUser, timezone: 'UTC', timezoneSource: 'default' } });
    mockFetch(backend.routes);
    storeSession();
    const user = userEvent.setup();
    renderApp('/dashboard');

    const banner = await screen.findByTestId('timezone-suggestion');
    expect(banner).toHaveTextContent('Your browser is set to America/Chicago');
    await waitFor(() => expect(backend.calls).toEqual(['priorities 2026-11-23 UTC limit=3'.replace('2026-11-23', calendarDateInTimeZone(new Date(), 'UTC'))]));
    expect(backend.patches).toEqual([]);

    await user.click(within(banner).getByRole('button', { name: 'Use America/Chicago' }));
    await waitFor(() => expect(backend.patches).toEqual([{ timezone: 'America/Chicago' }]));
    await waitFor(() => expect(screen.queryByTestId('timezone-suggestion')).not.toBeInTheDocument());
    // The dashboard's Top priorities are recalculated with the new time zone.
    await waitFor(() => expect(backend.calls.at(-1)).toMatch(/America\/Chicago limit=3$/));
    expect(backend.calls).toHaveLength(2);
    expect(await screen.findByTestId('top-priorities-date')).toHaveTextContent('(America/Chicago)');
  });

  test('"Keep UTC" saves UTC as a deliberate choice, so the suggestion does not return', async () => {
    detect('Asia/Tokyo');
    const backend = createBackend({ user: { ...testUser, timezone: 'UTC', timezoneSource: 'default' } });
    mockFetch(backend.routes);
    storeSession();
    const user = userEvent.setup();
    renderApp('/dashboard');
    await user.click(within(await screen.findByTestId('timezone-suggestion')).getByRole('button', { name: 'Keep UTC' }));
    await waitFor(() => expect(backend.patches).toEqual([{ timezone: 'UTC' }]));
    await waitFor(() => expect(screen.queryByTestId('timezone-suggestion')).not.toBeInTheDocument());
  });

  test('no suggestion when the user already chose a time zone, or the browser is on UTC', async () => {
    detect('America/Chicago');
    let backend = createBackend({ user: { ...testUser, timezone: 'Europe/London', timezoneSource: 'user' } });
    mockFetch(backend.routes);
    storeSession();
    const { unmount } = renderApp('/dashboard');
    await screen.findByRole('region', { name: 'Top priorities' });
    expect(screen.queryByTestId('timezone-suggestion')).not.toBeInTheDocument();
    unmount();

    vi.restoreAllMocks();
    detect('UTC');
    backend = createBackend({ user: { ...testUser, timezone: 'UTC', timezoneSource: 'default' } });
    mockFetch(backend.routes);
    renderApp('/dashboard');
    await screen.findByRole('region', { name: 'Top priorities' });
    expect(screen.queryByTestId('timezone-suggestion')).not.toBeInTheDocument();
    expect(backend.patches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('date-only values display as entered, west and east of UTC', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  for (const zone of ['America/Los_Angeles', 'America/Chicago', 'Asia/Tokyo']) {
    test(`Nov 30 stays Nov 30 with the browser in ${zone}`, () => {
      process.env.TZ = zone;
      const stored = '2026-11-30T00:00:00.000Z';
      if (zone.startsWith('America')) expect(new Date(stored).getDate()).toBe(29); // the trap: local time is Nov 29
      expect(formatDate(stored)).toBe(new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(stored)));
      expect(formatDate(stored)).toMatch(/30/);
      expect(formatDate('2026-11-30')).toMatch(/30/); // nextActionDate / referenceDate form
      expect(toDateInputValue(stored)).toBe('2026-11-30'); // edit form value
    });
  }

  test('lists, details and priorities show the entered calendar date', async () => {
    process.env.TZ = 'America/Los_Angeles';
    const app = { id: 'a1', company: 'Northwind', position: 'Engineer', status: 'Saved', interestLevel: 3, deadline: '2026-11-30T00:00:00.000Z', followUpDate: '2026-12-01T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' };
    const backend = createBackend({ user: { ...testUser, timezone: 'America/Los_Angeles', timezoneSource: 'user' }, items: [{ ...makeItem(1), ...app, priority: { ...makeItem(1).priority, nextActionDate: '2026-11-30' } }] });
    mockFetch({
      ...backend.routes,
      'GET /api/applications': () => jsonResponse(200, { applications: [app], pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false } }),
      'GET /api/applications/:id': () => jsonResponse(200, { application: app }),
    });
    storeSession();
    const user = userEvent.setup();
    const { unmount } = renderApp('/applications');
    const table = await screen.findByTestId('applications-table');
    expect(table).toHaveTextContent('Nov 30, 2026');
    expect(table).not.toHaveTextContent('Nov 29, 2026');
    await user.click(within(table).getByRole('button', { name: 'Engineer at Northwind: view details' }));
    const details = await screen.findByRole('dialog');
    await within(details).findByText('Nov 30, 2026');
    expect(details).toHaveTextContent('Dec 1, 2026');
    unmount();

    renderApp('/priorities');
    expect(await screen.findByText(/Next action:/)).toHaveTextContent('Next action: Nov 30, 2026');
  });
});

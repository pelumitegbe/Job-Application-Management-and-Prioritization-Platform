// Milestone 5C: time zone preference and time-zone-aware priority scoring.
// No MongoDB: User and JobApplication database methods are replaced with
// in-memory fakes, and the clock is pinned per test where it matters.

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

const User = require('../src/models/User');
const JobApplication = require('../src/models/JobApplication');
const { signAccessToken } = require('../src/services/tokenService');
const { rankApplications, scoreApplication } = require('../src/services/priorityScoring');
const { normalizeTimeZone, calendarDateInTimeZone, referenceDateFor, effectiveTimeZone } = require('../src/utils/timezone');
const { validateProfileUpdate } = require('../src/validators/authValidators');
const app = require('../src/app');

const at = (iso) => new Date(iso);
const dateOnly = (ymd) => new Date(`${ymd}T00:00:00.000Z`); // how "YYYY-MM-DD" is stored

/** Scores one application at instant `now` for a user in `timeZone`, the way the endpoint does. */
function scoreAt(application, now, timeZone) {
  return scoreApplication({ interestLevel: 3, ...application }, referenceDateFor(now, timeZone));
}

// ---------------------------------------------------------------------------
describe('time zone identifiers', () => {
  test('accepts IANA names, fixing letter case and keeping the chosen name', () => {
    assert.equal(normalizeTimeZone('UTC'), 'UTC');
    assert.equal(normalizeTimeZone('America/Chicago'), 'America/Chicago');
    assert.equal(normalizeTimeZone('america/new_york'), 'America/New_York');
    assert.equal(normalizeTimeZone('Etc/UTC'), 'UTC');
    assert.equal(normalizeTimeZone('  Asia/Tokyo  '), 'Asia/Tokyo');
    assert.equal(normalizeTimeZone('America/Argentina/Buenos_Aires'), 'America/Argentina/Buenos_Aires');
    // Current names are kept even where ICU's canonical form is a legacy alias.
    assert.equal(normalizeTimeZone('Asia/Kolkata'), 'Asia/Kolkata');
    assert.equal(normalizeTimeZone('us/pacific'), 'America/Los_Angeles');
  });

  test('rejects malformed, unknown and non-IANA values', () => {
    for (const value of [
      '',
      '   ',
      'Mars/Olympus_Mons',
      'Not a zone',
      '+05:00', // an offset, not an IANA name (Intl would accept it)
      '-0600',
      'America/Chicago; DROP TABLE',
      '../../etc/passwd',
      'America/',
      `America/${'x'.repeat(80)}`,
      'Europe/Lon don',
      'Europe\\London',
      123,
      null,
      undefined,
      {},
      ['UTC'],
    ]) {
      assert.equal(normalizeTimeZone(value), null, `should reject ${JSON.stringify(value)}`);
    }
  });

  test('existing accounts without a preference use UTC', () => {
    assert.equal(effectiveTimeZone(undefined), 'UTC');
    assert.equal(effectiveTimeZone(null), 'UTC');
    assert.equal(effectiveTimeZone('America/Chicago'), 'America/Chicago');
  });

  test('the User model validates the stored value', () => {
    assert.equal(new User({ name: 'A', email: 'a@example.com', passwordHash: 'x' }).validateSync(), undefined);
    assert.equal(new User({ name: 'A', email: 'a@example.com', passwordHash: 'x', timezone: 'Europe/Paris' }).validateSync(), undefined);
    const error = new User({ name: 'A', email: 'a@example.com', passwordHash: 'x', timezone: 'Bad/Zone' }).validateSync();
    assert.match(error.errors.timezone.message, /valid IANA time zone/);
  });

  test('profile update validation allows only a valid timezone', () => {
    assert.deepEqual(validateProfileUpdate({ timezone: 'america/chicago' }).value, { timezone: 'America/Chicago' });
    assert.deepEqual(Object.keys(validateProfileUpdate({ timezone: 'Nowhere/Land' }).fieldErrors), ['timezone']);
    assert.deepEqual(Object.keys(validateProfileUpdate({}).fieldErrors), ['timezone']);
    assert.deepEqual(Object.keys(validateProfileUpdate(null).fieldErrors), ['timezone']);
    assert.deepEqual(Object.keys(validateProfileUpdate([]).fieldErrors), ['timezone']);
    assert.deepEqual(Object.keys(validateProfileUpdate({ timezone: 'UTC', email: 'x@y.z' }).fieldErrors), ['email']);
  });
});

// ---------------------------------------------------------------------------
describe('reference date: the calendar date in the user\'s time zone', () => {
  // 2026-11-24T03:30Z is still Nov 23 in the Americas and already Nov 24 east of UTC.
  const instant = at('2026-11-24T03:30:00.000Z');
  const cases = [
    ['UTC', '2026-11-24'],
    ['America/Chicago', '2026-11-23'], // UTC-6
    ['America/New_York', '2026-11-23'], // UTC-5
    ['America/Los_Angeles', '2026-11-23'], // UTC-8
    ['Asia/Tokyo', '2026-11-24'], // UTC+9
    ['Asia/Kolkata', '2026-11-24'], // UTC+5:30
    ['Pacific/Kiritimati', '2026-11-24'], // UTC+14
  ];
  for (const [zone, expected] of cases) {
    test(`${zone} -> ${expected}`, () => {
      assert.equal(calendarDateInTimeZone(instant, zone), expected);
      assert.equal(referenceDateFor(instant, zone).toISOString(), `${expected}T00:00:00.000Z`);
    });
  }

  test('time zones ahead of UTC reach the next day first', () => {
    // 2026-11-23T15:00Z = Nov 24 00:00 in Tokyo, Nov 23 15:00 in UTC.
    assert.equal(calendarDateInTimeZone(at('2026-11-23T14:59:59.999Z'), 'Asia/Tokyo'), '2026-11-23');
    assert.equal(calendarDateInTimeZone(at('2026-11-23T15:00:00.000Z'), 'Asia/Tokyo'), '2026-11-24');
    assert.equal(calendarDateInTimeZone(at('2026-11-23T10:00:00.000Z'), 'Pacific/Kiritimati'), '2026-11-24');
  });

  test('daylight saving: local midnight moves in UTC, the calendar date stays right', () => {
    // US DST 2026: starts Sun Mar 8 (02:00 -> 03:00), ends Sun Nov 1 (02:00 -> 01:00).
    // Chicago midnight is 06:00Z in winter (CST) and 05:00Z in summer (CDT).
    assert.equal(calendarDateInTimeZone(at('2026-03-08T05:59:59.999Z'), 'America/Chicago'), '2026-03-07'); // 23:59:59 CST
    assert.equal(calendarDateInTimeZone(at('2026-03-08T06:00:00.000Z'), 'America/Chicago'), '2026-03-08'); // 00:00 CST
    assert.equal(calendarDateInTimeZone(at('2026-03-09T04:59:59.999Z'), 'America/Chicago'), '2026-03-08'); // 23:59:59 CDT
    assert.equal(calendarDateInTimeZone(at('2026-03-09T05:00:00.000Z'), 'America/Chicago'), '2026-03-09'); // 00:00 CDT (23-hour day)
    assert.equal(calendarDateInTimeZone(at('2026-11-01T04:59:59.999Z'), 'America/Chicago'), '2026-10-31'); // 23:59:59 CDT
    assert.equal(calendarDateInTimeZone(at('2026-11-01T05:00:00.000Z'), 'America/Chicago'), '2026-11-01'); // 00:00 CDT
    assert.equal(calendarDateInTimeZone(at('2026-11-02T05:59:59.999Z'), 'America/Chicago'), '2026-11-01'); // 23:59:59 CST (25-hour day)
    assert.equal(calendarDateInTimeZone(at('2026-11-02T06:00:00.000Z'), 'America/Chicago'), '2026-11-02');
    // Southern hemisphere: Sydney DST ends Sun Apr 5 2026 (03:00 -> 02:00).
    assert.equal(calendarDateInTimeZone(at('2026-04-04T12:59:59.999Z'), 'Australia/Sydney'), '2026-04-04'); // 23:59:59 AEDT
    assert.equal(calendarDateInTimeZone(at('2026-04-04T13:00:00.000Z'), 'Australia/Sydney'), '2026-04-05');
  });
});

// ---------------------------------------------------------------------------
describe('time-zone-aware scoring', () => {
  test('deadline scoring changes exactly at local midnight (Chicago)', () => {
    const app = { status: 'Saved', deadline: dateOnly('2026-11-30') };
    // Nov 29 23:59:59.999 CST -> "in 1 day" (90); Nov 30 00:00 CST -> "today" (100).
    const before = scoreAt(app, at('2026-11-30T05:59:59.999Z'), 'America/Chicago');
    const after = scoreAt(app, at('2026-11-30T06:00:00.000Z'), 'America/Chicago');
    assert.equal(before.factors.deadline.daysUntil, 1);
    assert.equal(before.factors.deadline.score, 90);
    assert.equal(before.factors.deadline.explanation, 'Application deadline is in 1 day.');
    assert.equal(after.factors.deadline.daysUntil, 0);
    assert.equal(after.factors.deadline.score, 100);
    assert.equal(after.factors.deadline.explanation, 'Application deadline is today.');
    // The day after, the deadline has expired.
    const expired = scoreAt(app, at('2026-12-01T06:00:00.000Z'), 'America/Chicago');
    assert.equal(expired.factors.deadline.expired, true);
    assert.equal(expired.factors.deadline.score, 0);
  });

  test('follow-up scoring changes exactly at local midnight (New York and Los Angeles)', () => {
    const app = { status: 'Applied', followUpDate: dateOnly('2026-11-30') };
    // New York midnight Dec 1 = 05:00Z; Los Angeles midnight Dec 1 = 08:00Z.
    const nyBefore = scoreAt(app, at('2026-12-01T04:59:59.999Z'), 'America/New_York');
    const nyAfter = scoreAt(app, at('2026-12-01T05:00:00.000Z'), 'America/New_York');
    assert.equal(nyBefore.factors.followUp.explanation, 'Follow-up is due today.');
    assert.equal(nyBefore.factors.followUp.overdue, false);
    assert.equal(nyAfter.factors.followUp.explanation, 'Follow-up is overdue by 1 day.');
    assert.equal(nyAfter.factors.followUp.overdue, true);

    const laBefore = scoreAt(app, at('2026-12-01T07:59:59.999Z'), 'America/Los_Angeles');
    const laAfter = scoreAt(app, at('2026-12-01T08:00:00.000Z'), 'America/Los_Angeles');
    assert.equal(laBefore.factors.followUp.overdue, false);
    assert.equal(laAfter.factors.followUp.overdue, true);
  });

  test('the same instant scores differently by time zone, following each local date', () => {
    // 2026-11-30T03:00Z: Nov 29 evening in the Americas, Nov 30 in UTC and Tokyo.
    const app = { status: 'Saved', deadline: dateOnly('2026-11-30'), followUpDate: dateOnly('2026-11-29') };
    const now = at('2026-11-30T03:00:00.000Z');
    const byZone = Object.fromEntries(
      ['UTC', 'America/Chicago', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'].map((zone) => [zone, scoreAt(app, now, zone)])
    );
    for (const zone of ['America/Chicago', 'America/New_York', 'America/Los_Angeles']) {
      assert.equal(byZone[zone].factors.deadline.daysUntil, 1, zone);
      assert.equal(byZone[zone].factors.followUp.explanation, 'Follow-up is due today.', zone);
    }
    for (const zone of ['UTC', 'Asia/Tokyo']) {
      assert.equal(byZone[zone].factors.deadline.daysUntil, 0, zone);
      assert.equal(byZone[zone].factors.followUp.explanation, 'Follow-up is overdue by 1 day.', zone);
    }
  });

  test('scoring across a DST change counts calendar days, not 24-hour periods', () => {
    // Chicago, Sat Mar 7 2026 at 23:30 CST; deadline Mon Mar 9 (Sunday is only 23 hours long).
    const app = { status: 'Saved', deadline: dateOnly('2026-03-09') };
    assert.equal(scoreAt(app, at('2026-03-08T05:30:00.000Z'), 'America/Chicago').factors.deadline.daysUntil, 2);
    // Sun Nov 1 2026 (25 hours): at 23:30 CST on Nov 1, a Nov 2 follow-up is due in 1 day.
    const followUp = { status: 'Applied', followUpDate: dateOnly('2026-11-02') };
    assert.equal(scoreAt(followUp, at('2026-11-02T05:30:00.000Z'), 'America/Chicago').factors.followUp.daysUntil, 1);
  });

  test('date-only values keep their calendar date in every time zone', () => {
    // Nov 30 stored as 2026-11-30T00:00Z must never become Nov 29 for users west of UTC.
    const app = { status: 'Saved', deadline: dateOnly('2026-11-30') };
    for (const zone of ['America/Chicago', 'America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu']) {
      const priority = scoreAt(app, at('2026-11-29T18:00:00.000Z'), zone); // Nov 29 local everywhere listed
      assert.equal(priority.nextActionDate, '2026-11-30', zone);
      assert.equal(priority.factors.deadline.daysUntil, 1, zone);
    }
  });

  test('UTC users score exactly as before Milestone 5C', () => {
    const apps = [
      { id: 'a', status: 'Saved', deadline: dateOnly('2026-11-25'), interestLevel: 5 },
      { id: 'b', status: 'Applied', followUpDate: dateOnly('2026-11-20'), interestLevel: 3 },
      { id: 'c', status: 'Interviewing', interestLevel: 4 },
      { id: 'd', status: 'Rejected', followUpDate: dateOnly('2026-11-20'), interestLevel: 5 },
    ];
    const now = at('2026-11-23T15:30:00.000Z');
    assert.deepEqual(rankApplications(apps, referenceDateFor(now, 'UTC')), rankApplications(apps, now));
    const [first] = rankApplications(apps, referenceDateFor(now, 'UTC'));
    assert.equal(first.priority.score, Math.round(0.4 * 90 + 0.25 * 0 + 0.2 * 40 + 0.15 * 100)); // formula unchanged: 59
    const rejected = rankApplications(apps, referenceDateFor(now, 'America/Chicago')).at(-1);
    assert.equal(rejected.priority.score, 0);
    assert.equal(rejected.priority.category, 'No action');
  });
});

// ---------------------------------------------------------------------------
// HTTP: GET/PATCH /api/auth/me and GET /api/applications/priorities
// ---------------------------------------------------------------------------
const userDocs = new Map(); // id -> { _id, name, email, createdAt, timezone? }
const updates = [];
const applications = [];
let server;
let baseUrl;

async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function addUser(fields = {}) {
  const id = new mongoose.Types.ObjectId();
  userDocs.set(id.toString(), { _id: id, name: 'Test User', email: `${id}@example.com`, createdAt: new Date('2026-11-01T00:00:00Z'), ...fields });
  return { id: id.toString(), token: signAccessToken(id.toString()) };
}

describe('HTTP: time zone preference and priorities', () => {
  before(async () => {
    mock.method(User, 'findById', async (id) => userDocs.get(String(id)) ?? null);
    mock.method(User, 'findByIdAndUpdate', async (id, update, options) => {
      updates.push({ id: String(id), update, options });
      const doc = userDocs.get(String(id));
      if (!doc) return null;
      Object.assign(doc, update.$set);
      return doc;
    });
    mock.method(JobApplication, 'find', async (filter) => {
      if (!filter || filter.user === undefined) throw new Error('Unscoped query');
      return applications.filter((doc) => String(doc.user) === String(filter.user) && (!filter.status || doc.status !== filter.status.$ne));
    });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => {
    userDocs.clear();
    updates.length = 0;
    applications.length = 0;
    mock.timers.reset();
  });

  after(async () => {
    mock.restoreAll();
    mock.timers.reset();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  test('GET /me: an existing account without a preference reports UTC (default)', async () => {
    const user = addUser();
    const res = await request('GET', '/api/auth/me', { token: user.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.timezone, 'UTC');
    assert.equal(res.body.user.timezoneSource, 'default');
  });

  test('PATCH /me saves the signed-in user\'s own time zone (normalized)', async () => {
    const alice = addUser();
    const bob = addUser({ timezone: 'Europe/London' });
    const res = await request('PATCH', '/api/auth/me', { token: alice.token, body: { timezone: 'america/chicago' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.timezone, 'America/Chicago');
    assert.equal(res.body.user.timezoneSource, 'user');
    assert.deepEqual(Object.keys(res.body.user).sort(), ['createdAt', 'email', 'id', 'name', 'timezone', 'timezoneSource']);
    // Only the token's user is updated, with validators on; Bob is untouched.
    assert.deepEqual(updates.map((u) => u.id), [alice.id]);
    assert.equal(updates[0].options.runValidators, true);
    assert.equal(userDocs.get(bob.id).timezone, 'Europe/London');

    const me = await request('GET', '/api/auth/me', { token: alice.token });
    assert.equal(me.body.user.timezone, 'America/Chicago');
  });

  test('PATCH /me: choosing UTC explicitly marks the preference as chosen', async () => {
    const user = addUser();
    const res = await request('PATCH', '/api/auth/me', { token: user.token, body: { timezone: 'UTC' } });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.user.timezone, res.body.user.timezoneSource], ['UTC', 'user']);
  });

  test('PATCH /me rejects invalid time zones and any other field', async () => {
    const user = addUser({ timezone: 'Asia/Tokyo' });
    for (const body of [{ timezone: 'Mars/Base' }, { timezone: '+05:00' }, { timezone: 42 }, { timezone: '' }, {}]) {
      const res = await request('PATCH', '/api/auth/me', { token: user.token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.errors.timezone, JSON.stringify(body));
    }
    const other = await request('PATCH', '/api/auth/me', { token: user.token, body: { timezone: 'UTC', email: 'new@example.com', id: 'x' } });
    assert.equal(other.status, 400);
    assert.deepEqual(Object.keys(other.body.errors).sort(), ['email', 'id']);
    assert.equal(updates.length, 0, 'nothing saved');
    assert.equal(userDocs.get(user.id).timezone, 'Asia/Tokyo');
  });

  test('PATCH /me requires authentication; a deleted account gets 401', async () => {
    assert.equal((await request('PATCH', '/api/auth/me', { body: { timezone: 'UTC' } })).status, 401);
    assert.equal((await request('PATCH', '/api/auth/me', { token: 'not.a.jwt', body: { timezone: 'UTC' } })).status, 401);
    const ghost = signAccessToken(new mongoose.Types.ObjectId().toString());
    const res = await request('PATCH', '/api/auth/me', { token: ghost, body: { timezone: 'UTC' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'User account no longer exists.');
  });

  test('GET /priorities uses the user\'s time zone and reports it in the metadata', async () => {
    // 2026-11-30T03:00Z: Nov 29 in Chicago, Nov 30 in UTC and Tokyo.
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-30T03:00:00.000Z') });
    const chicago = addUser({ timezone: 'America/Chicago' });
    const legacy = addUser(); // no preference -> UTC
    const tokyo = addUser({ timezone: 'Asia/Tokyo' });
    for (const owner of [chicago, legacy, tokyo]) {
      applications.push(new JobApplication({ user: owner.id, company: 'Co', position: 'Role', status: 'Saved', deadline: dateOnly('2026-11-30'), interestLevel: 3 }));
    }

    const c = await request('GET', '/api/applications/priorities', { token: chicago.token });
    assert.equal(c.status, 200);
    assert.deepEqual(c.body.scoring, { formula: 'P = 0.40D + 0.25F + 0.20S + 0.15I', referenceDate: '2026-11-29', timezone: 'America/Chicago', includeRejected: false });
    assert.equal(c.body.applications[0].priority.factors.deadline.explanation, 'Application deadline is in 1 day.');
    assert.equal(c.body.applications[0].deadline, '2026-11-30T00:00:00.000Z', 'stored date returned unchanged');

    const u = await request('GET', '/api/applications/priorities', { token: legacy.token });
    assert.deepEqual([u.body.scoring.referenceDate, u.body.scoring.timezone], ['2026-11-30', 'UTC']);
    assert.equal(u.body.applications[0].priority.factors.deadline.explanation, 'Application deadline is today.');

    const t = await request('GET', '/api/applications/priorities', { token: tokyo.token });
    assert.deepEqual([t.body.scoring.referenceDate, t.body.scoring.timezone], ['2026-11-30', 'Asia/Tokyo']);
  });

  test('GET /priorities: a deleted account gets 401', async () => {
    const ghost = signAccessToken(new mongoose.Types.ObjectId().toString());
    const res = await request('GET', '/api/applications/priorities', { token: ghost });
    assert.equal(res.status, 401);
  });
});

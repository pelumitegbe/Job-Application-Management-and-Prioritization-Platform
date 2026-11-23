// Integration tests for GET /api/applications/priorities against a REAL MongoDB.
//
// Same safety rules as the other integration files:
//   * Skipped unless TEST_MONGODB_URI is set; never reads MONGODB_URI or .env.
//   * The database name must end in "_test" (default: job_application_platform_test).
//   * Creates two throwaway users with "@integration-test.invalid" emails and
//     deletes only those users and the applications they own afterwards.
//
// The endpoint scores "as of now", so dates are built relative to today (UTC).

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const TEST_URI = process.env.TEST_MONGODB_URI;
const TEST_DB_NAME = process.env.TEST_MONGODB_DB_NAME || 'job_application_platform_test';
const EMAIL_DOMAIN = '@integration-test.invalid';
const skip = !TEST_URI && 'TEST_MONGODB_URI is not set';

/** YYYY-MM-DD for today (UTC) + n days. */
function day(n) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n)).toISOString().slice(0, 10);
}

describe('priorities integration (real MongoDB)', { skip }, () => {
  let User;
  let JobApplication;
  let server;
  let baseUrl;
  const runId = crypto.randomBytes(4).toString('hex');
  const password = 'IntegrationPassword123!';
  const alice = { email: `prio-a-${runId}${EMAIL_DOMAIN}` };
  const bob = { email: `prio-b-${runId}${EMAIL_DOMAIN}` };

  async function api(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body && JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function signUp(user) {
    assert.equal((await api('POST', '/api/auth/register', { body: { name: 'Integration', email: user.email, password } })).status, 201);
    const login = await api('POST', '/api/auth/login', { body: { email: user.email, password } });
    Object.assign(user, { id: login.body.user.id, token: login.body.token });
  }

  async function create(user, body) {
    const res = await api('POST', '/api/applications', { token: user.token, body });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.application;
  }

  before(async () => {
    if (!TEST_DB_NAME.endsWith('_test')) {
      throw new Error(`Refusing to run: TEST_MONGODB_DB_NAME "${TEST_DB_NAME}" must end in "_test".`);
    }
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

    await mongoose.connect(TEST_URI, { dbName: TEST_DB_NAME, serverSelectionTimeoutMS: 5000 });
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    User = require('../../src/models/User');
    JobApplication = require('../../src/models/JobApplication');
    await Promise.all([User.init(), JobApplication.init()]);

    const app = require('../../src/app');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await signUp(alice);
    await signUp(bob);
  });

  after(async () => {
    const ownerIds = [alice.id, bob.id].filter(Boolean);
    if (JobApplication && ownerIds.length) await JobApplication.deleteMany({ user: { $in: ownerIds } });
    if (User) await User.deleteMany({ email: { $in: [alice.email, bob.email] } });
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  test('requires authentication', async () => {
    assert.equal((await api('GET', '/api/applications/priorities')).status, 401);
    assert.equal((await api('GET', '/api/applications/priorities', { token: 'bad.token.value' })).status, 401);
  });

  test('ranks real applications, excludes rejected ones, and returns the breakdown', async () => {
    await create(alice, { company: 'Low Co', position: 'Low', status: 'Saved', interestLevel: 1 }); // 11
    await create(alice, { company: 'Top Co', position: 'Top', status: 'Saved', deadline: day(0), followUpDate: day(-2), interestLevel: 5 }); // 88
    await create(alice, { company: 'Mid Co', position: 'Interviewing', status: 'Interviewing', followUpDate: day(1), interestLevel: 4 }); // 21.25 + 18 + 12 = 51.25 -> 51
    await create(alice, { company: 'Gone Co', position: 'Rejected', status: 'Rejected', followUpDate: day(0), interestLevel: 5 });
    await create(alice, { company: 'Late Co', position: 'Expired deadline', status: 'Saved', deadline: day(-3), interestLevel: 3 }); // 8 + 9 = 17

    const res = await api('GET', '/api/applications/priorities', { token: alice.token });
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.applications.map((a) => [a.position, a.priority.score, a.priority.category]),
      [
        ['Top', 88, 'Critical'],
        ['Interviewing', 51, 'High'],
        ['Expired deadline', 17, 'Low'],
        ['Low', 11, 'Low'],
      ]
    );
    assert.equal(res.body.pagination.total, 4);
    assert.equal(res.body.scoring.referenceDate, day(0));

    const expired = res.body.applications[2].priority;
    assert.equal(expired.factors.deadline.score, 0);
    assert.equal(expired.factors.deadline.expired, true);
    assert.ok(expired.explanations.includes('Application deadline has passed (3 days ago).'));

    const top = res.body.applications[0];
    assert.equal(top.user, alice.id);
    assert.ok(top.priority.explanations.includes('Follow-up is overdue by 2 days.'));
    assert.ok(top.priority.explanations.includes('Application deadline is today.'));
  });

  test('includeRejected=true adds rejected applications at score 0', async () => {
    const res = await api('GET', '/api/applications/priorities?includeRejected=true', { token: alice.token });
    assert.equal(res.body.pagination.total, 5);
    const last = res.body.applications.at(-1);
    assert.equal(last.position, 'Rejected');
    assert.equal(last.priority.score, 0);
    assert.equal(last.priority.category, 'No action');
  });

  test('pagination slices the global ranking', async () => {
    const page1 = await api('GET', '/api/applications/priorities?page=1&limit=2', { token: alice.token });
    const page2 = await api('GET', '/api/applications/priorities?page=2&limit=2', { token: alice.token });
    assert.deepEqual(page1.body.applications.map((a) => a.position), ['Top', 'Interviewing']);
    assert.deepEqual(page2.body.applications.map((a) => a.position), ['Expired deadline', 'Low']);
    assert.deepEqual(page1.body.pagination, { page: 1, limit: 2, total: 4, totalPages: 2, hasNextPage: true, hasPrevPage: false });
  });

  test("ownership isolation: Bob never sees Alice's priorities", async () => {
    const empty = await api('GET', '/api/applications/priorities', { token: bob.token });
    assert.deepEqual(empty.body.applications, []);
    assert.equal(empty.body.pagination.total, 0);

    await create(bob, { company: 'Bob Co', position: "Bob's", status: 'Offer', interestLevel: 2 });
    const forBob = await api('GET', '/api/applications/priorities', { token: bob.token });
    assert.deepEqual(forBob.body.applications.map((a) => a.position), ["Bob's"]);
    assert.ok(forBob.body.applications.every((a) => a.user === bob.id));

    const forAlice = await api('GET', '/api/applications/priorities', { token: alice.token });
    assert.ok(!forAlice.body.applications.some((a) => a.position === "Bob's"));
  });

  test('nothing is stored: documents have no priority field', async () => {
    const stored = await JobApplication.find({ user: alice.id }).lean();
    assert.ok(stored.length > 0);
    assert.ok(stored.every((doc) => !('priority' in doc)));
  });
  test('time zone preference: stored per user, UTC by default, used for scoring (Milestone 5C)', async () => {
    // Bob was registered normally and never chose a time zone: no field is stored, UTC applies.
    const rawBob = await User.collection.findOne({ email: bob.email });
    assert.equal('timezone' in rawBob, false);
    const bobMe = await api('GET', '/api/auth/me', { token: bob.token });
    assert.deepEqual([bobMe.body.user.timezone, bobMe.body.user.timezoneSource], ['UTC', 'default']);

    const deadline = await create(alice, { company: 'TZ Co', position: 'TZ Role', status: 'Saved', deadline: day(3) });
    const before = await JobApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(deadline.id) });

    const saved = await api('PATCH', '/api/auth/me', { token: alice.token, body: { timezone: 'America/Chicago' } });
    assert.equal(saved.status, 200);
    assert.deepEqual([saved.body.user.timezone, saved.body.user.timezoneSource], ['America/Chicago', 'user']);
    assert.equal((await User.collection.findOne({ email: alice.email })).timezone, 'America/Chicago');
    assert.equal('timezone' in (await User.collection.findOne({ email: bob.email })), false, "Bob's account untouched");

    const invalid = await api('PATCH', '/api/auth/me', { token: alice.token, body: { timezone: 'Nowhere/Special' } });
    assert.equal(invalid.status, 400);
    assert.equal((await User.collection.findOne({ email: alice.email })).timezone, 'America/Chicago');

    const ranked = await api('GET', '/api/applications/priorities', { token: alice.token });
    assert.equal(ranked.body.scoring.timezone, 'America/Chicago');
    const chicagoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    assert.equal(ranked.body.scoring.referenceDate, chicagoToday);
    const item = ranked.body.applications.find((a) => a.id === deadline.id);
    assert.equal(item.deadline, `${day(3)}T00:00:00.000Z`, 'date-only value unchanged');

    // Scoring never writes to application records.
    const after = await JobApplication.collection.findOne({ _id: new mongoose.Types.ObjectId(deadline.id) });
    assert.deepEqual(after, before);
  });
});

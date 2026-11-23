// HTTP tests for GET /api/applications/priorities without MongoDB.
// JobApplication.find is replaced by an in-memory store that, like the real
// query, matches on the exact filter (including { status: { $ne: 'Rejected' } })
// and throws if a query is not scoped to a user. The clock is pinned so the
// endpoint's "now" is deterministic.

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

const JobApplication = require('../src/models/JobApplication');
const User = require('../src/models/User');
const { signAccessToken } = require('../src/services/tokenService');
const app = require('../src/app');

const NOW = new Date('2026-11-23T15:30:00.000Z');
const day = (n) => new Date(Date.UTC(2026, 10, 23 + n));

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
const store = []; // JobApplication documents
const queries = [];
const users = new Map(); // userId -> stored timezone (undefined = never chosen)

function matches(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && '$ne' in condition) return String(doc[key]) !== String(condition.$ne);
    return String(doc[key]) === String(condition);
  });
}

let createdAt = Date.parse('2026-01-01T00:00:00Z');
function add(owner, fields) {
  const doc = new JobApplication({ user: owner, company: 'Co', position: 'Role', ...fields });
  createdAt += 60_000;
  doc.createdAt = new Date(createdAt);
  doc.updatedAt = doc.createdAt;
  store.push(doc);
  return doc;
}

let server;
let baseUrl;
let alice;
let bob;

async function get(path, token) {
  const res = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  mock.timers.enable({ apis: ['Date'], now: NOW.getTime() });
  mock.method(JobApplication, 'find', async (filter) => {
    queries.push(filter);
    if (!filter || filter.user === undefined) throw new Error('Unscoped query');
    return store.filter((doc) => matches(doc, filter));
  });
  // The endpoint reads the user's time zone; unknown ids behave like deleted accounts.
  mock.method(User, 'findById', async (id) => (users.has(String(id)) ? { _id: id, timezone: users.get(String(id)) } : null));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  store.length = 0;
  queries.length = 0;
  users.clear();
  const aliceId = new mongoose.Types.ObjectId().toString();
  const bobId = new mongoose.Types.ObjectId().toString();
  users.set(aliceId, undefined); // existing account: no preference, so UTC
  users.set(bobId, undefined);
  alice = { id: aliceId, token: signAccessToken(aliceId) };
  bob = { id: bobId, token: signAccessToken(bobId) };
});

after(async () => {
  mock.restoreAll();
  mock.timers.reset();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
describe('GET /api/applications/priorities', () => {
  test('requires a valid JWT', async () => {
    assert.equal((await get('/api/applications/priorities')).status, 401);
    assert.equal((await get('/api/applications/priorities', 'not.a.jwt')).status, 401);
    assert.equal(queries.length, 0);
  });

  test('"priorities" is a route, not an application id', async () => {
    const res = await get('/api/applications/priorities', alice.token);
    assert.equal(res.status, 200);
    // The /:id routes still validate ids as before.
    assert.equal((await get('/api/applications/not-an-id', alice.token)).status, 400);
  });

  test('returns an empty ranking when the user has no applications', async () => {
    const res = await get('/api/applications/priorities', alice.token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      applications: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
      scoring: { formula: 'P = 0.40D + 0.25F + 0.20S + 0.15I', referenceDate: '2026-11-23', timezone: 'UTC', includeRejected: false },
    });
  });

  test('returns each application with its full priority breakdown', async () => {
    const doc = add(alice.id, {
      company: 'Microsoft',
      position: 'SWE Intern',
      status: 'Saved',
      deadline: day(2),
      followUpDate: day(7),
      interestLevel: 4,
    });
    const res = await get('/api/applications/priorities', alice.token);
    assert.equal(res.status, 200);
    const [item] = res.body.applications;

    // Same application fields as the other endpoints...
    assert.equal(item.id, doc._id.toString());
    assert.equal(item.user, alice.id);
    assert.equal(item.company, 'Microsoft');
    assert.equal(item.deadline, '2026-11-25T00:00:00.000Z');
    assert.equal(item._id, undefined);
    // ...plus the priority breakdown.
    assert.deepEqual(item.priority, {
      score: 71,
      category: 'High',
      rawScore: 71,
      factors: {
        deadline: { score: 90, weight: 0.4, contribution: 36, explanation: 'Application deadline is in 2 days.', daysUntil: 2, expired: false, applies: true },
        followUp: { score: 60, weight: 0.25, contribution: 15, explanation: 'Follow-up is due in 7 days.', daysUntil: 7, overdue: false },
        stage: { score: 40, weight: 0.2, contribution: 8, explanation: 'Application is saved but has not been submitted yet.' },
        interest: { score: 80, weight: 0.15, contribution: 12, explanation: 'Interest level is 4 out of 5.', level: 4 },
      },
      explanations: [
        'Application deadline is in 2 days.',
        'Follow-up is due in 7 days.',
        'Application is saved but has not been submitted yet.',
        'Interest level is 4 out of 5.',
      ],
      nextActionDate: '2026-11-25',
    });
  });

  test('ranks by score, then next action date, then id', async () => {
    add(alice.id, { position: 'Low', status: 'Saved', interestLevel: 1 }); // 8 + 3 = 11
    add(alice.id, { position: 'Critical', status: 'Saved', deadline: day(0), followUpDate: day(-1), interestLevel: 5 }); // 40 + 25 + 8 + 15 = 88
    add(alice.id, { position: 'Tie later', status: 'Applied', interestLevel: 3, followUpDate: day(20) }); // 2.5 + 12 + 9 = 23.5 -> 24
    add(alice.id, { position: 'Tie sooner', status: 'Applied', interestLevel: 3, followUpDate: day(16) }); // 24, earlier action date
    add(alice.id, { position: 'Interviewing', status: 'Interviewing', interestLevel: 5, followUpDate: day(0) }); // 25 + 18 + 15 = 58

    const res = await get('/api/applications/priorities', alice.token);
    assert.deepEqual(
      res.body.applications.map((a) => [a.position, a.priority.score]),
      [
        ['Critical', 88],
        ['Interviewing', 58],
        ['Tie sooner', 24],
        ['Tie later', 24],
        ['Low', 11],
      ]
    );
  });

  test('ranks the complete set before paginating (the top item can be the oldest record)', async () => {
    // 25 low-priority applications, then the most urgent one created first.
    const top = add(alice.id, { position: 'Most urgent', status: 'Saved', deadline: day(0), interestLevel: 5 });
    for (let i = 0; i < 25; i += 1) add(alice.id, { position: `Filler ${i}`, status: 'Saved', interestLevel: 1 });

    const page1 = await get('/api/applications/priorities?limit=10', alice.token);
    assert.equal(page1.body.applications[0].id, top._id.toString());
    assert.deepEqual(page1.body.pagination, { page: 1, limit: 10, total: 26, totalPages: 3, hasNextPage: true, hasPrevPage: false });

    // Pages are consecutive slices of one global ranking.
    const pages = [];
    for (const page of [1, 2, 3]) {
      pages.push(...(await get(`/api/applications/priorities?page=${page}&limit=10`, alice.token)).body.applications);
    }
    assert.equal(pages.length, 26);
    assert.equal(new Set(pages.map((a) => a.id)).size, 26);
    const scores = pages.map((a) => a.priority.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));

    const past = await get('/api/applications/priorities?page=9&limit=10', alice.token);
    assert.deepEqual(past.body.applications, []);
    assert.equal(past.body.pagination.total, 26);
  });

  test('excludes rejected applications by default (in the database query)', async () => {
    add(alice.id, { position: 'Rejected one', status: 'Rejected', followUpDate: day(0), interestLevel: 5 });
    add(alice.id, { position: 'Active', status: 'Applied' });

    const res = await get('/api/applications/priorities', alice.token);
    assert.deepEqual(res.body.applications.map((a) => a.position), ['Active']);
    assert.equal(res.body.pagination.total, 1);
    assert.deepEqual(queries.at(-1), { user: alice.id, status: { $ne: 'Rejected' } });
  });

  test('includeRejected=true includes them, scored 0 / "No action", ranked last', async () => {
    add(alice.id, { position: 'Rejected one', status: 'Rejected', deadline: day(0), followUpDate: day(0), interestLevel: 5 });
    add(alice.id, { position: 'Active', status: 'Saved', interestLevel: 1 });

    const res = await get('/api/applications/priorities?includeRejected=true', alice.token);
    assert.deepEqual(res.body.applications.map((a) => a.position), ['Active', 'Rejected one']);
    const rejected = res.body.applications[1].priority;
    assert.equal(rejected.score, 0);
    assert.equal(rejected.category, 'No action');
    assert.deepEqual(rejected.explanations, ['Application is rejected and requires no further action.']);
    assert.equal(res.body.scoring.includeRejected, true);
    assert.deepEqual(queries.at(-1), { user: alice.id });
  });

  test("users only ever see their own applications", async () => {
    add(alice.id, { position: "Alice's", status: 'Interviewing' });
    add(bob.id, { position: "Bob's", status: 'Offer', followUpDate: day(0), interestLevel: 5 });

    const forAlice = await get('/api/applications/priorities', alice.token);
    const forBob = await get('/api/applications/priorities', bob.token);
    assert.deepEqual(forAlice.body.applications.map((a) => a.position), ["Alice's"]);
    assert.deepEqual(forBob.body.applications.map((a) => a.position), ["Bob's"]);
    for (const filter of queries) assert.ok([alice.id, bob.id].includes(String(filter.user)));
  });

  test('the owner comes from the token only; a user query parameter is rejected', async () => {
    const res = await get(`/api/applications/priorities?user=${bob.id}`, alice.token);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors, { user: 'Unknown query parameter: user.' });
    assert.equal(queries.length, 0);
  });

  test('validates query parameters with the existing conventions', async () => {
    const cases = [
      ['?limit=101', { limit: 'limit must be at most 100.' }],
      ['?page=0', { page: 'page must be a positive integer.' }],
      ['?includeRejected=yes', { includeRejected: 'includeRejected must be true or false.' }],
      ['?includeRejected=1', { includeRejected: 'includeRejected must be true or false.' }],
      ['?sort=score', { sort: 'Unknown query parameter: sort.' }],
    ];
    for (const [query, errors] of cases) {
      const res = await get(`/api/applications/priorities${query}`, alice.token);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.status, 'error');
      assert.match(res.body.message, /^Validation failed: /);
      assert.deepEqual(res.body.errors, errors, query);
    }
    const ok = await get('/api/applications/priorities?includeRejected=false&page=1&limit=5', alice.token);
    assert.equal(ok.status, 200);
  });

  test('scores are recalculated per request and never written back', async () => {
    const doc = add(alice.id, { status: 'Saved', deadline: day(1), interestLevel: 3 });
    const res = await get('/api/applications/priorities', alice.token);
    assert.equal(res.body.applications[0].priority.score, 53); // 36 + 8 + 9
    assert.equal(doc.priority, undefined);
    assert.equal(JobApplication.schema.path('priority'), undefined);
  });
});

// HTTP tests for the job application CRUD API that do NOT need MongoDB.
//
// The JobApplication model's database methods are replaced by an in-memory
// store. To reflect owner-scoped queries accurately, the fake store:
//   * matches documents only on the exact filter it receives (no hidden scoping),
//   * THROWS if a find/findOne/update/delete/count filter has no `user` condition,
//   * runs real Mongoose schema validation on create and update,
//   * records every filter so the suite can assert that all queries were scoped.
// Routes, authentication, validation and controllers all run for real.

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

const JobApplication = require('../src/models/JobApplication');
const User = require('../src/models/User');
const { signAccessToken } = require('../src/services/tokenService');
const app = require('../src/app');

// ---------------------------------------------------------------------------
// In-memory, owner-scope-enforcing replacement for the applications collection
// ---------------------------------------------------------------------------
const applications = new Map(); // id -> JobApplication document
const knownUsers = new Set();
const queryLog = []; // { method, filter }
let clock = Date.parse('2026-11-01T00:00:00Z');
const nextTime = () => new Date((clock += 1000));

function requireOwnerScope(method, filter) {
  queryLog.push({ method, filter });
  if (!filter || filter.user === undefined) {
    throw new Error(`Unscoped ${method} query: filter has no user condition`);
  }
}

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

function findMatching(filter) {
  return [...applications.values()].filter((doc) => matches(doc, filter));
}

function compareBySort(sortSpec) {
  return (a, b) => {
    for (const [key, direction] of Object.entries(sortSpec)) {
      const av = key === '_id' ? a._id.toString() : a[key];
      const bv = key === '_id' ? b._id.toString() : b[key];
      if (av < bv) return -direction;
      if (av > bv) return direction;
    }
    return 0;
  };
}

function installFakeStore() {
  mock.method(User, 'exists', async (filter) => (knownUsers.has(String(filter._id)) ? { _id: filter._id } : null));

  mock.method(JobApplication, 'create', async (data) => {
    const doc = new JobApplication(data);
    await doc.validate();
    doc.createdAt = nextTime();
    doc.updatedAt = doc.createdAt;
    applications.set(doc._id.toString(), doc);
    return doc;
  });

  mock.method(JobApplication, 'find', (filter) => {
    requireOwnerScope('find', filter);
    let sortSpec = {};
    let skip = 0;
    let limit = Infinity;
    const query = {
      sort(spec) { sortSpec = spec; return query; },
      skip(n) { skip = n; return query; },
      limit(n) { limit = n; return query; },
      then(resolve, reject) {
        const results = findMatching(filter).sort(compareBySort(sortSpec)).slice(skip, skip + limit);
        return Promise.resolve(results).then(resolve, reject);
      },
    };
    return query;
  });

  mock.method(JobApplication, 'countDocuments', async (filter) => {
    requireOwnerScope('countDocuments', filter);
    return findMatching(filter).length;
  });

  mock.method(JobApplication, 'findOne', async (filter) => {
    requireOwnerScope('findOne', filter);
    return findMatching(filter)[0] || null;
  });

  mock.method(JobApplication, 'findOneAndUpdate', async (filter, update, options) => {
    requireOwnerScope('findOneAndUpdate', filter);
    assert.equal(options.runValidators, true, 'updates must run validators');
    assert.equal(options.returnDocument, 'after', 'updates must return the updated document');

    const existing = findMatching(filter)[0];
    if (!existing) return null;

    const doc = new JobApplication(existing.toObject());
    for (const [key, value] of Object.entries(update.$set || {})) doc.set(key, value);
    for (const key of Object.keys(update.$unset || {})) doc.set(key, undefined);
    await doc.validate();
    doc.updatedAt = nextTime();
    applications.set(doc._id.toString(), doc);
    return doc;
  });

  mock.method(JobApplication, 'deleteOne', async (filter) => {
    requireOwnerScope('deleteOne', filter);
    const doc = findMatching(filter)[0];
    if (doc) applications.delete(doc._id.toString());
    return { acknowledged: true, deletedCount: doc ? 1 : 0 };
  });
}

// ---------------------------------------------------------------------------
// Users, tokens and HTTP helpers
// ---------------------------------------------------------------------------
function newUser() {
  const id = new mongoose.Types.ObjectId().toString();
  knownUsers.add(id);
  return { id, token: signAccessToken(id) };
}

let userA;
let userB;
let server;
let baseUrl;
const issuedTokens = [];
const capturedLogs = [];

async function api(method, path, { token, body, rawBody } = {}) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    issuedTokens.push(token);
  }
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
}

const sample = {
  company: 'Microsoft',
  position: 'Software Engineering Intern',
  status: 'Applied',
  location: 'Redmond, WA',
  jobUrl: 'https://careers.microsoft.com/',
  applicationDate: '2026-11-11',
  deadline: '2026-11-30',
  followUpDate: '2026-11-20',
  interestLevel: 5,
  notes: 'Applied through the company careers portal.',
};

const createApp = (user, body = sample) => api('POST', '/api/applications', { token: user.token, body });
const getApp = (user, id) => api('GET', `/api/applications/${id}`, { token: user.token });
const listApps = (user, query = '') => api('GET', `/api/applications${query}`, { token: user.token });
const patchApp = (user, id, body) => api('PATCH', `/api/applications/${id}`, { token: user.token, body });
const deleteApp = (user, id) => api('DELETE', `/api/applications/${id}`, { token: user.token });

const missingId = () => new mongoose.Types.ObjectId().toString();

before(async () => {
  installFakeStore();
  // Capture everything the server logs, to check that no token or secret leaks.
  for (const level of ['log', 'warn', 'error']) {
    mock.method(console, level, (...args) => capturedLogs.push(args.map(String).join(' ')));
  }
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  applications.clear();
  knownUsers.clear();
  userA = newUser();
  userB = newUser();
});

after(async () => {
  mock.restoreAll();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
describe('authentication', () => {
  const someId = '6650f1c2a1b2c3d4e5f60718';

  for (const [method, path] of [
    ['POST', '/api/applications'],
    ['GET', '/api/applications'],
    ['GET', `/api/applications/${someId}`],
    ['PATCH', `/api/applications/${someId}`],
    ['DELETE', `/api/applications/${someId}`],
  ]) {
    test(`${method} ${path.replace(someId, ':id')} without a JWT returns 401`, async () => {
      const res = await api(method, path, method === 'POST' || method === 'PATCH' ? { body: sample } : {});
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { status: 'error', message: 'Authentication required.' });
    });
  }

  test('invalid, wrongly signed and expired JWTs return 401 on every endpoint', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const badTokens = [
      'not.a.jwt',
      jwt.sign({}, 'another-secret-that-is-long-enough-1234567890', { subject: userA.id, expiresIn: '1h' }),
      jwt.sign({ sub: userA.id, iat: past, exp: past + 3600 }, process.env.JWT_SECRET),
    ];
    for (const token of badTokens) {
      for (const [method, path] of [['POST', '/api/applications'], ['GET', '/api/applications'], ['PATCH', `/api/applications/${someId}`], ['DELETE', `/api/applications/${someId}`]]) {
        const res = await api(method, path, { token, body: method === 'POST' || method === 'PATCH' ? sample : undefined });
        assert.equal(res.status, 401, `${method} ${path}`);
        assert.deepEqual(res.body, { status: 'error', message: 'Invalid or expired token.' });
      }
    }
    assert.equal(applications.size, 0);
  });

  test('a valid token for a deleted user cannot create applications', async () => {
    knownUsers.delete(userA.id);
    const res = await createApp(userA);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'User account no longer exists.');
    assert.equal(applications.size, 0);
  });
});

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------
describe('POST /api/applications', () => {
  test('valid request returns 201 with the created application owned by the caller', async () => {
    const res = await createApp(userA);
    assert.equal(res.status, 201);

    const { application } = res.body;
    assert.match(application.id, /^[0-9a-f]{24}$/);
    assert.equal(application.user, userA.id);
    assert.equal(application.company, 'Microsoft');
    assert.equal(application.position, 'Software Engineering Intern');
    assert.equal(application.status, 'Applied');
    assert.equal(application.location, 'Redmond, WA');
    assert.equal(application.jobUrl, 'https://careers.microsoft.com/');
    assert.equal(application.applicationDate, '2026-11-11T00:00:00.000Z');
    assert.equal(application.deadline, '2026-11-30T00:00:00.000Z');
    assert.equal(application.followUpDate, '2026-11-20T00:00:00.000Z');
    assert.equal(application.interestLevel, 5);
    assert.equal(application.notes, sample.notes);
    assert.ok(application.createdAt && application.updatedAt);
    assert.equal(application._id, undefined);
    assert.equal(application.__v, undefined);
    assert.equal(applications.size, 1);
  });

  test('defaults are applied: status "Saved" and interestLevel 3; optional fields omitted', async () => {
    const res = await createApp(userA, { company: '  Acme  ', position: ' Developer ' });
    assert.equal(res.status, 201);
    const { application } = res.body;
    assert.equal(application.company, 'Acme', 'trimmed');
    assert.equal(application.position, 'Developer', 'trimmed');
    assert.equal(application.status, 'Saved');
    assert.equal(application.interestLevel, 3);
    for (const field of ['location', 'jobUrl', 'applicationDate', 'deadline', 'followUpDate', 'notes']) {
      assert.equal(application[field], undefined, field);
    }
  });

  test('optional fields sent as null or "" are treated as not provided', async () => {
    const res = await createApp(userA, { company: 'Acme', position: 'Dev', location: '', jobUrl: null, deadline: null, notes: '' });
    assert.equal(res.status, 201);
    for (const field of ['location', 'jobUrl', 'deadline', 'notes']) assert.equal(res.body.application[field], undefined);
  });

  const invalidCases = [
    ['missing company', { ...sample, company: undefined }, /company is required/],
    ['blank company', { ...sample, company: '   ' }, /company is required/],
    ['missing position', { ...sample, position: undefined }, /position is required/],
    ['non-string position', { ...sample, position: 42 }, /position is required/],
    ['company too long', { ...sample, company: 'x'.repeat(151) }, /company must be at most 150 characters/],
    ['location too long', { ...sample, location: 'x'.repeat(201) }, /location must be at most 200 characters/],
    ['notes too long', { ...sample, notes: 'x'.repeat(5001) }, /notes must be at most 5000 characters/],
    ['invalid status', { ...sample, status: 'Ghosted' }, /status must be one of: Saved, Applied, Interviewing, Offer, Rejected/],
    ['status with wrong case', { ...sample, status: 'applied' }, /status must be one of/],
    ['interestLevel 0', { ...sample, interestLevel: 0 }, /interestLevel must be an integer from 1 to 5/],
    ['interestLevel 6', { ...sample, interestLevel: 6 }, /interestLevel must be an integer from 1 to 5/],
    ['interestLevel 2.5', { ...sample, interestLevel: 2.5 }, /interestLevel must be an integer from 1 to 5/],
    ['interestLevel as string', { ...sample, interestLevel: '5' }, /interestLevel must be an integer from 1 to 5/],
    ['invalid URL', { ...sample, jobUrl: 'not a url' }, /jobUrl must be a valid http or https URL/],
    ['non-http URL', { ...sample, jobUrl: 'javascript:alert(1)' }, /jobUrl must be a valid http or https URL/],
    ['ftp URL', { ...sample, jobUrl: 'ftp://example.com/job' }, /jobUrl must be a valid http or https URL/],
    ['invalid date', { ...sample, deadline: 'next Friday' }, /deadline must be a valid date/],
    ['impossible date', { ...sample, deadline: '2026-02-30' }, /deadline must be a valid date/],
    ['numeric timestamp date', { ...sample, followUpDate: 1767225600000 }, /followUpDate must be a valid date/],
    ['ambiguous date format', { ...sample, applicationDate: '11/11/2026' }, /applicationDate must be a valid date/],
    ['unknown field', { ...sample, salary: 100000 }, /Unknown field: salary\./],
    ['priority field (not in this milestone)', { ...sample, priorityScore: 0.9 }, /Unknown field: priorityScore\./],
  ];

  for (const [name, body, expected] of invalidCases) {
    test(`${name} returns 400`, async () => {
      const res = await createApp(userA, body);
      assert.equal(res.status, 400);
      assert.equal(res.body.status, 'error');
      assert.match(res.body.message, /^Validation failed: /);
      assert.match(res.body.message, expected);
      assert.equal(applications.size, 0, 'nothing was stored');
    });
  }

  test('all problems are reported together', async () => {
    const res = await createApp(userA, { status: 'Nope', interestLevel: 9 });
    assert.equal(res.status, 400);
    for (const expected of [/company is required/, /position is required/, /status must be one of/, /interestLevel must be/]) {
      assert.match(res.body.message, expected);
    }
  });

  test('non-object bodies return 400', async () => {
    for (const rawBody of ['[]', '"text"', '42', 'null']) {
      const res = await api('POST', '/api/applications', { token: userA.token, rawBody });
      assert.equal(res.status, 400, rawBody);
    }
    const noBody = await api('POST', '/api/applications', { token: userA.token });
    assert.equal(noBody.status, 400);
  });

  test('client-supplied owner and server-managed fields are rejected', async () => {
    for (const field of ['user', '_id', 'id', 'createdAt', 'updatedAt', '__v']) {
      const value = field === 'user' || field === '_id' || field === 'id' ? userB.id : '2020-01-01';
      const res = await createApp(userA, { ...sample, [field]: value });
      assert.equal(res.status, 400, field);
      assert.match(res.body.message, new RegExp(`${field} cannot be set by the client`));
    }
    assert.equal(applications.size, 0);
  });
});

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------
describe('GET /api/applications', () => {
  test('returns the caller\'s applications, newest first, with pagination metadata', async () => {
    const first = (await createApp(userA, { company: 'First', position: 'Dev' })).body.application;
    const second = (await createApp(userA, { company: 'Second', position: 'Dev' })).body.application;

    const res = await listApps(userA);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.applications.map((a) => a.id), [second.id, first.id]);
    assert.deepEqual(res.body.pagination, {
      page: 1, limit: 20, total: 2, totalPages: 1, hasNextPage: false, hasPrevPage: false,
    });
  });

  test('a user with no applications receives an empty list', async () => {
    const res = await listApps(userA);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      applications: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
    });
  });

  test('pagination splits results into pages using page and limit', async () => {
    const created = [];
    for (let i = 1; i <= 5; i += 1) {
      created.push((await createApp(userA, { company: `Company ${i}`, position: 'Dev' })).body.application.id);
    }
    const newestFirst = [...created].reverse();

    const page1 = await listApps(userA, '?page=1&limit=2');
    const page2 = await listApps(userA, '?page=2&limit=2');
    const page3 = await listApps(userA, '?page=3&limit=2');
    const page4 = await listApps(userA, '?page=4&limit=2');

    assert.deepEqual(page1.body.applications.map((a) => a.id), newestFirst.slice(0, 2));
    assert.deepEqual(page2.body.applications.map((a) => a.id), newestFirst.slice(2, 4));
    assert.deepEqual(page3.body.applications.map((a) => a.id), newestFirst.slice(4));
    assert.deepEqual(page2.body.pagination, { page: 2, limit: 2, total: 5, totalPages: 3, hasNextPage: true, hasPrevPage: true });
    assert.equal(page3.body.pagination.hasNextPage, false);
    assert.equal(page4.status, 200, 'a page past the end is not an error');
    assert.deepEqual(page4.body.applications, []);

    const max = await listApps(userA, '?limit=100');
    assert.equal(max.status, 200);
    assert.equal(max.body.pagination.limit, 100);
  });

  for (const [query, expected] of [
    ['?page=0', /page must be a positive integer/],
    ['?page=-1', /page must be a positive integer/],
    ['?page=abc', /page must be a positive integer/],
    ['?page=1.5', /page must be a positive integer/],
    ['?limit=0', /limit must be a positive integer/],
    ['?limit=101', /limit must be at most 100/],
    ['?limit=', /limit must be a positive integer/],
    ['?page=1&page=2', /page must be a positive integer/],
    ['?sort=company', /Unknown query parameter: sort/],
    ['?user=6650f1c2a1b2c3d4e5f60718', /Unknown query parameter: user/],
  ]) {
    test(`invalid pagination ${query} returns 400`, async () => {
      const res = await listApps(userA, query);
      assert.equal(res.status, 400);
      assert.match(res.body.message, expected);
    });
  }
});

describe('GET /api/applications/:id', () => {
  test('returns an application the caller owns', async () => {
    const created = (await createApp(userA)).body.application;
    const res = await getApp(userA, created.id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { application: created });
  });

  for (const badId of ['123', 'not-an-id', 'zzzzzzzzzzzzzzzzzzzzzzzz', 'aaaaaaaaaaaa', `${'a'.repeat(24)}0`]) {
    test(`malformed id "${badId}" returns 400`, async () => {
      const res = await getApp(userA, badId);
      assert.equal(res.status, 400);
      assert.match(res.body.message, /id must be a valid 24-character hexadecimal ID/);
    });
  }

  test('a nonexistent id returns 404', async () => {
    const res = await getApp(userA, missingId());
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { status: 'error', message: 'Application not found.' });
  });
});

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------
describe('PATCH /api/applications/:id', () => {
  test('updates the caller\'s application and returns it', async () => {
    const created = (await createApp(userA)).body.application;
    const res = await patchApp(userA, created.id, { status: 'Interviewing', interestLevel: 4 });

    assert.equal(res.status, 200);
    assert.equal(res.body.application.status, 'Interviewing');
    assert.equal(res.body.application.interestLevel, 4);
    assert.ok(res.body.application.updatedAt > created.updatedAt, 'updatedAt changes');
    assert.equal(res.body.application.createdAt, created.createdAt, 'createdAt is preserved');

    const reread = await getApp(userA, created.id);
    assert.deepEqual(reread.body.application, res.body.application, 'change was persisted');
  });

  test('partial updates preserve unspecified fields', async () => {
    const created = (await createApp(userA)).body.application;
    const res = await patchApp(userA, created.id, { notes: 'Recruiter replied.' });
    assert.equal(res.status, 200);

    const { notes: newNotes, updatedAt, ...rest } = res.body.application;
    const { notes: oldNotes, updatedAt: oldUpdatedAt, ...expectedRest } = created;
    assert.equal(newNotes, 'Recruiter replied.');
    assert.notEqual(oldNotes, newNotes);
    assert.ok(updatedAt && oldUpdatedAt);
    assert.deepEqual(rest, expectedRest);
  });

  test('optional fields can be cleared with null or ""', async () => {
    const created = (await createApp(userA)).body.application;
    const res = await patchApp(userA, created.id, { deadline: null, location: '', jobUrl: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.application.deadline, undefined);
    assert.equal(res.body.application.location, undefined);
    assert.equal(res.body.application.jobUrl, undefined);
    assert.equal(res.body.application.followUpDate, created.followUpDate, 'other dates kept');
  });

  test('an empty update body returns 400', async () => {
    const created = (await createApp(userA)).body.application;
    const res = await patchApp(userA, created.id, {});
    assert.equal(res.status, 400);
    assert.match(res.body.message, /at least one field to update/);

    const noBody = await api('PATCH', `/api/applications/${created.id}`, { token: userA.token });
    assert.equal(noBody.status, 400);
  });

  test('attempts to modify protected fields return 400 and change nothing', async () => {
    const created = (await createApp(userA)).body.application;
    for (const [field, value] of [['user', userB.id], ['_id', missingId()], ['id', missingId()], ['createdAt', '2020-01-01'], ['updatedAt', '2020-01-01']]) {
      const res = await patchApp(userA, created.id, { [field]: value, notes: 'should not apply' });
      assert.equal(res.status, 400, field);
      assert.match(res.body.message, new RegExp(`${field} cannot be set by the client`));
    }
    assert.deepEqual((await getApp(userA, created.id)).body.application, created);
  });

  for (const [name, body, expected] of [
    ['invalid status', { status: 'Hired' }, /status must be one of/],
    ['interestLevel out of range', { interestLevel: 10 }, /interestLevel must be an integer from 1 to 5/],
    ['invalid URL', { jobUrl: 'www.example.com' }, /jobUrl must be a valid http or https URL/],
    ['invalid date', { followUpDate: '2026-13-01' }, /followUpDate must be a valid date/],
    ['blank company', { company: '' }, /company is required/],
    ['null company', { company: null }, /company is required/],
    ['null status', { status: null }, /status must be one of/],
    ['null interestLevel', { interestLevel: null }, /interestLevel must be an integer/],
    ['unknown field', { favorite: true }, /Unknown field: favorite\./],
  ]) {
    test(`invalid update (${name}) returns 400`, async () => {
      const created = (await createApp(userA)).body.application;
      const res = await patchApp(userA, created.id, body);
      assert.equal(res.status, 400);
      assert.match(res.body.message, expected);
      assert.deepEqual((await getApp(userA, created.id)).body.application, created, 'unchanged');
    });
  }

  test('updating a nonexistent application returns 404', async () => {
    const res = await patchApp(userA, missingId(), { status: 'Offer' });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, 'Application not found.');
  });

  test('a malformed id returns 400', async () => {
    const res = await patchApp(userA, 'abc', { status: 'Offer' });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------
describe('DELETE /api/applications/:id', () => {
  test('deletes the caller\'s application with 204 and no body; it can no longer be retrieved', async () => {
    const created = (await createApp(userA)).body.application;
    const res = await deleteApp(userA, created.id);
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assert.equal(applications.size, 0);

    assert.equal((await getApp(userA, created.id)).status, 404);
    assert.deepEqual((await listApps(userA)).body.applications, []);
    assert.equal((await deleteApp(userA, created.id)).status, 404, 'second delete');
  });

  test('deleting a nonexistent application returns 404', async () => {
    const res = await deleteApp(userA, missingId());
    assert.equal(res.status, 404);
    assert.equal(res.body.message, 'Application not found.');
  });

  test('a malformed id returns 400', async () => {
    const res = await deleteApp(userA, 'not-an-id');
    assert.equal(res.status, 400);
  });

  test('only the targeted application is deleted', async () => {
    const keep = (await createApp(userA, { company: 'Keep', position: 'Dev' })).body.application;
    const drop = (await createApp(userA, { company: 'Drop', position: 'Dev' })).body.application;
    assert.equal((await deleteApp(userA, drop.id)).status, 204);
    assert.deepEqual((await listApps(userA)).body.applications.map((a) => a.id), [keep.id]);
  });
});

// ---------------------------------------------------------------------------
// Ownership isolation: User B knows User A's application ID
// ---------------------------------------------------------------------------
describe('ownership isolation', () => {
  let appOfA;
  beforeEach(async () => {
    appOfA = (await createApp(userA)).body.application;
  });

  test('User B cannot retrieve User A\'s application (same 404 as a missing record)', async () => {
    const res = await getApp(userB, appOfA.id);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, (await getApp(userB, missingId())).body, 'indistinguishable from nonexistent');
  });

  test('User B cannot update User A\'s application', async () => {
    const res = await patchApp(userB, appOfA.id, { status: 'Rejected', notes: 'tampered' });
    assert.equal(res.status, 404);
    assert.deepEqual((await getApp(userA, appOfA.id)).body.application, appOfA, 'unchanged');
  });

  test('User B cannot delete User A\'s application', async () => {
    const res = await deleteApp(userB, appOfA.id);
    assert.equal(res.status, 404);
    assert.equal((await getApp(userA, appOfA.id)).status, 200, 'still exists');
  });

  test('User B cannot see User A\'s application in their list', async () => {
    const appOfB = (await createApp(userB, { company: 'B Corp', position: 'Dev' })).body.application;
    const listB = await listApps(userB);
    assert.deepEqual(listB.body.applications.map((a) => a.id), [appOfB.id]);
    assert.equal(listB.body.pagination.total, 1);

    const listA = await listApps(userA);
    assert.deepEqual(listA.body.applications.map((a) => a.id), [appOfA.id]);
  });

  test('User B cannot create an application assigned to User A', async () => {
    const res = await createApp(userB, { ...sample, user: userA.id });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /user cannot be set by the client/);
    assert.equal((await listApps(userA)).body.pagination.total, 1, 'A still has only their own application');
  });

  test('User B cannot reassign User A\'s application, or their own, to another user', async () => {
    const appOfB = (await createApp(userB, { company: 'B Corp', position: 'Dev' })).body.application;
    assert.equal((await patchApp(userB, appOfB.id, { user: userA.id })).status, 400);
    assert.equal((await patchApp(userB, appOfA.id, { user: userB.id })).status, 400);
    assert.equal((await getApp(userB, appOfB.id)).body.application.user, userB.id);
  });
});

// ---------------------------------------------------------------------------
// Suite-wide checks
// ---------------------------------------------------------------------------
test('every database query issued by the API was scoped to the authenticated user', async () => {
  // Exercise each operation once more so this test does not depend on order.
  const created = (await createApp(userA)).body.application;
  await listApps(userA);
  await getApp(userB, created.id);
  await patchApp(userB, created.id, { notes: 'x' });
  await deleteApp(userB, created.id);

  assert.ok(queryLog.length > 50);
  for (const { method, filter } of queryLog) {
    assert.ok(mongoose.isValidObjectId(String(filter.user)), `${method} filter has an owner`);
    if (['findOne', 'findOneAndUpdate', 'deleteOne'].includes(method)) {
      assert.deepEqual(Object.keys(filter).sort(), ['_id', 'user'], `${method} filters by _id AND user`);
    }
  }
  const lastB = queryLog.slice(-3);
  for (const { filter } of lastB) assert.equal(String(filter.user), userB.id, 'owner comes from B\'s token');
});

test('no JWT or JWT secret was written to the server logs', () => {
  const logs = capturedLogs.join('\n');
  assert.ok(issuedTokens.length > 50);
  assert.ok(!logs.includes(process.env.JWT_SECRET), 'secret not logged');
  for (const token of new Set(issuedTokens)) {
    assert.ok(!logs.includes(token), 'token not logged');
  }
});

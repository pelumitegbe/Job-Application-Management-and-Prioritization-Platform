// Integration tests for the job application CRUD API against a REAL MongoDB.
//
// Same safety rules as auth.integration.test.js:
//   * Skipped unless TEST_MONGODB_URI is set; never reads MONGODB_URI or .env.
//   * The database name must end in "_test" (default: job_application_platform_test).
//   * Creates two throwaway users with "@integration-test.invalid" emails and
//     deletes only those users and the applications they own afterwards.
//
// Run with:  TEST_MONGODB_URI="<connection string>" npm run test:integration

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const TEST_URI = process.env.TEST_MONGODB_URI;
const TEST_DB_NAME = process.env.TEST_MONGODB_DB_NAME || 'job_application_platform_test';
const EMAIL_DOMAIN = '@integration-test.invalid';

const skip = !TEST_URI && 'TEST_MONGODB_URI is not set';

describe('job application CRUD integration (real MongoDB)', { skip }, () => {
  let User;
  let JobApplication;
  let server;
  let baseUrl;
  const runId = crypto.randomBytes(4).toString('hex');
  const password = 'IntegrationPassword123!';
  const userA = { email: `apps-a-${runId}${EMAIL_DOMAIN}` };
  const userB = { email: `apps-b-${runId}${EMAIL_DOMAIN}` };

  async function api(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body && JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function signUp(user) {
    const reg = await api('POST', '/api/auth/register', { body: { name: 'Integration', email: user.email, password } });
    assert.equal(reg.status, 201);
    const login = await api('POST', '/api/auth/login', { body: { email: user.email, password } });
    assert.equal(login.status, 200);
    Object.assign(user, { id: reg.body.user.id, token: login.body.token });
  }

  before(async () => {
    if (!TEST_DB_NAME.endsWith('_test')) {
      throw new Error(`Refusing to run: TEST_MONGODB_DB_NAME "${TEST_DB_NAME}" must end in "_test".`);
    }
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

    await mongoose.connect(TEST_URI, { dbName: TEST_DB_NAME, serverSelectionTimeoutMS: 5000 });
    assert.equal(mongoose.connection.name, TEST_DB_NAME, 'connected to the test database');

    User = require('../../src/models/User');
    JobApplication = require('../../src/models/JobApplication');
    await Promise.all([User.init(), JobApplication.init()]);

    const app = require('../../src/app');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await signUp(userA);
    await signUp(userB);
  });

  after(async () => {
    const ownerIds = [userA.id, userB.id].filter(Boolean);
    if (JobApplication && ownerIds.length) await JobApplication.deleteMany({ user: { $in: ownerIds } });
    if (User) await User.deleteMany({ email: { $in: [userA.email, userB.email] } });
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  test('the owner-scoped index exists in the database', async () => {
    const indexes = await JobApplication.collection.indexes();
    assert.ok(indexes.some((i) => JSON.stringify(i.key) === JSON.stringify({ user: 1, createdAt: -1, _id: -1 })));
  });

  test('full CRUD lifecycle with real query behavior', async () => {
    const created = await api('POST', '/api/applications', {
      token: userA.token,
      body: { company: 'Microsoft', position: 'SWE Intern', deadline: '2026-11-30', interestLevel: 5 },
    });
    assert.equal(created.status, 201);
    const { id } = created.body.application;
    assert.equal(created.body.application.status, 'Saved');

    const stored = await JobApplication.findById(id).lean();
    assert.equal(stored.user.toString(), userA.id, 'owner stored from the JWT');
    assert.ok(stored.deadline instanceof Date, 'stored as a BSON date');

    const updated = await api('PATCH', `/api/applications/${id}`, {
      token: userA.token, body: { status: 'Interviewing', deadline: null },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.application.status, 'Interviewing');
    assert.equal(updated.body.application.deadline, undefined);
    assert.equal(updated.body.application.company, 'Microsoft');
    assert.equal((await JobApplication.findById(id).lean()).deadline, undefined, '$unset removed the field');

    const fetched = await api('GET', `/api/applications/${id}`, { token: userA.token });
    assert.deepEqual(fetched.body.application, updated.body.application);

    assert.equal((await api('DELETE', `/api/applications/${id}`, { token: userA.token })).status, 204);
    assert.equal(await JobApplication.countDocuments({ _id: id }), 0);
    assert.equal((await api('GET', `/api/applications/${id}`, { token: userA.token })).status, 404);
  });

  test('update validators run in the database update path', async () => {
    const { body } = await api('POST', '/api/applications', { token: userA.token, body: { company: 'A', position: 'B' } });
    // Bypass the request validators to prove Mongoose still validates updates.
    await assert.rejects(
      JobApplication.findOneAndUpdate({ _id: body.application.id, user: userA.id }, { $set: { status: 'Ghosted' } }, { runValidators: true }),
      (err) => err.name === 'ValidationError'
    );
  });

  test('pagination and newest-first ordering against real data', async () => {
    await JobApplication.deleteMany({ user: userA.id });
    const ids = [];
    for (let i = 1; i <= 3; i += 1) {
      const res = await api('POST', '/api/applications', { token: userA.token, body: { company: `C${i}`, position: 'Dev' } });
      ids.push(res.body.application.id);
    }
    const page1 = await api('GET', '/api/applications?page=1&limit=2', { token: userA.token });
    const page2 = await api('GET', '/api/applications?page=2&limit=2', { token: userA.token });
    assert.deepEqual([...page1.body.applications, ...page2.body.applications].map((a) => a.id), ids.reverse());
    assert.deepEqual(page1.body.pagination, { page: 1, limit: 2, total: 3, totalPages: 2, hasNextPage: true, hasPrevPage: false });
  });

  test('ownership isolation: User B cannot read, list, update or delete User A\'s application', async () => {
    const { body } = await api('POST', '/api/applications', { token: userA.token, body: { company: 'Private', position: 'Dev' } });
    const id = body.application.id;

    assert.equal((await api('GET', `/api/applications/${id}`, { token: userB.token })).status, 404);
    assert.equal((await api('PATCH', `/api/applications/${id}`, { token: userB.token, body: { notes: 'tampered' } })).status, 404);
    assert.equal((await api('DELETE', `/api/applications/${id}`, { token: userB.token })).status, 404);

    const listB = await api('GET', '/api/applications', { token: userB.token });
    assert.ok(!listB.body.applications.some((a) => a.id === id));

    const stillThere = await JobApplication.findById(id).lean();
    assert.equal(stillThere.notes, undefined, 'not modified');
    assert.equal(stillThere.user.toString(), userA.id);

    const forged = await api('POST', '/api/applications', { token: userB.token, body: { company: 'X', position: 'Y', user: userA.id } });
    assert.equal(forged.status, 400);
  });
});

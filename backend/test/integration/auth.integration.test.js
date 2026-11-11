// Integration tests for authentication against a REAL MongoDB database.
//
// These are skipped unless TEST_MONGODB_URI is set. They never read
// MONGODB_URI or backend/.env, so they cannot touch your development data.
//
// Safety rules:
//   * The database name must end in "_test" (default: job_application_platform_test).
//   * Only users with emails ending in "@integration-test.invalid" are created,
//     and only those users are deleted afterwards.
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

describe('auth integration (real MongoDB)', { skip }, () => {
  let User;
  let server;
  let baseUrl;
  const runId = crypto.randomBytes(4).toString('hex');
  const email = `user-${runId}${EMAIL_DOMAIN}`;
  const password = 'IntegrationPassword123!';

  async function request(method, path, { body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body && JSON.stringify(body) });
    const text = await res.text();
    assert.ok(!/passwordHash|\$2[aby]\$/.test(text), 'response must not contain a password hash');
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  before(async () => {
    if (!TEST_DB_NAME.endsWith('_test')) {
      throw new Error(`Refusing to run: TEST_MONGODB_DB_NAME "${TEST_DB_NAME}" must end in "_test".`);
    }
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

    await mongoose.connect(TEST_URI, { dbName: TEST_DB_NAME, serverSelectionTimeoutMS: 5000 });
    User = require('../../src/models/User');
    await User.init(); // ensure the unique email index exists

    const app = require('../../src/app');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (User) {
      // Only this run's users (other integration files may be running in parallel).
      await User.deleteMany({ email: { $regex: `-${runId}${EMAIL_DOMAIN.replace('.', '\\.')}$` } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  test('database has a unique index on email', async () => {
    const indexes = await User.collection.indexes();
    assert.ok(indexes.some((i) => i.key.email === 1 && i.unique === true));
  });

  test('register -> stored hash -> duplicate -> login -> me -> delete -> me', async () => {
    const reg = await request('POST', '/api/auth/register', { body: { name: 'Integration User', email: email.toUpperCase(), password } });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.user.email, email);

    const stored = await User.findOne({ email }).select('+passwordHash').lean();
    assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
    assert.notEqual(stored.passwordHash, password);

    const dup = await request('POST', '/api/auth/register', { body: { name: 'Again', email, password } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.errors, undefined, 'no field errors on 409');

    const bad = await request('POST', '/api/auth/login', { body: { email, password: 'WrongPassword123!' } });
    assert.equal(bad.status, 401);

    const login = await request('POST', '/api/auth/login', { body: { email, password } });
    assert.equal(login.status, 200);
    const { exp } = JSON.parse(Buffer.from(login.body.token.split('.')[1], 'base64url').toString());
    assert.equal(login.body.expiresAt, new Date(exp * 1000).toISOString(), 'expiresAt matches the JWT exp claim');

    const me = await request('GET', '/api/auth/me', { token: login.body.token });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.user, reg.body.user);

    await User.deleteOne({ email });
    const afterDelete = await request('GET', '/api/auth/me', { token: login.body.token });
    assert.equal(afterDelete.status, 401);
  });

  test('concurrent duplicate registrations: exactly one succeeds (unique index)', async () => {
    const raceEmail = `race-${runId}${EMAIL_DOMAIN}`;
    const results = await Promise.all(
      [1, 2, 3].map(() => request('POST', '/api/auth/register', { body: { name: 'Racer', email: raceEmail, password } }))
    );
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409]);
    assert.equal(await User.countDocuments({ email: raceEmail }), 1);
  });
});

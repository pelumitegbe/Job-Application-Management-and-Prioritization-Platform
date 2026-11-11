// Tests for the approved response improvements:
//   1. `errors` object (field -> message) on 400 validation responses
//   2. `expiresAt` on successful login, taken from the JWT's exp claim
//   3. generic malformed-JSON message and query-free 404 messages
// No database: the few model calls needed are mocked.

const { test, describe, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

const app = require('../src/app');
const User = require('../src/models/User');
const JobApplication = require('../src/models/JobApplication');
const errorHandler = require('../src/middleware/errorHandler');
const { signAccessToken, getTokenExpiresAt } = require('../src/services/tokenService');

const password = 'SecurePassword123!';
const existingUser = new User({ name: 'Existing', email: 'taken@example.com', passwordHash: bcrypt.hashSync(password, 4) });
existingUser.createdAt = new Date('2026-11-01T00:00:00Z');
const userId = existingUser._id.toString();
const token = signAccessToken(userId);

let server;
let baseUrl;

async function api(method, path, { body, rawBody, auth = false } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text, body: text ? JSON.parse(text) : null };
}

before(async () => {
  mock.method(User, 'exists', async (filter) => (filter.email === 'taken@example.com' || filter._id ? { _id: userId } : null));
  mock.method(User, 'findOne', (filter) => ({ select: async () => (filter.email === existingUser.email ? existingUser : null) }));
  mock.method(JobApplication, 'findOne', async () => null);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  mock.restoreAll();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// 1. Field-level validation errors
// ---------------------------------------------------------------------------
describe('field-level validation errors (errors object on 400)', () => {
  test('registration: every invalid field is keyed; message is unchanged', async () => {
    const res = await api('POST', '/api/auth/register', { body: { email: 'not-an-email', password: 'short' } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      status: 'error',
      message: 'Validation failed: name is required. email must be a valid email address. password must be at least 8 characters.',
      errors: {
        name: 'name is required.',
        email: 'email must be a valid email address.',
        password: 'password must be at least 8 characters.',
      },
    });
  });

  test('registration: the submitted password is never echoed', async () => {
    const res = await api('POST', '/api/auth/register', { body: { name: 'A', email: 'a@example.com', password: 'Pw1234!' } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors, { password: 'password must be at least 8 characters.' });
    assert.ok(!res.text.includes('Pw1234!'));
  });

  test('login: missing fields are keyed', async () => {
    const res = await api('POST', '/api/auth/login', { body: {} });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors, { email: 'email is required.', password: 'password is required.' });
    assert.equal(res.body.message, 'Validation failed: email is required. password is required.');
  });

  test('application create: invalid, unknown and protected fields are keyed', async () => {
    const res = await api('POST', '/api/applications', {
      auth: true,
      body: { position: 'Dev', status: 'Ghosted', interestLevel: 9, jobUrl: 'nope', deadline: '2026-02-30', salary: 1, user: userId },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors, {
      user: 'user cannot be set by the client.',
      salary: 'Unknown field: salary.',
      company: 'company is required.',
      status: 'status must be one of: Saved, Applied, Interviewing, Offer, Rejected.',
      jobUrl: 'jobUrl must be a valid http or https URL.',
      deadline: 'deadline must be a valid date in YYYY-MM-DD or ISO 8601 format.',
      interestLevel: 'interestLevel must be an integer from 1 to 5.',
    });
    // The message still lists every problem, in the same order as before.
    assert.equal(
      res.body.message,
      // Field-name problems come first, in request-body key order, then value problems.
      'Validation failed: Unknown field: salary. user cannot be set by the client. company is required. ' +
        'status must be one of: Saved, Applied, Interviewing, Offer, Rejected. jobUrl must be a valid http or https URL. ' +
        'deadline must be a valid date in YYYY-MM-DD or ISO 8601 format. interestLevel must be an integer from 1 to 5.'
    );
    assert.ok(!res.text.includes('Ghosted') && !res.text.includes('2026-02-30'), 'submitted values are not echoed');
  });

  test('application update: keyed errors for invalid values and protected fields', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const res = await api('PATCH', `/api/applications/${id}`, { auth: true, body: { company: '', createdAt: '2020-01-01' } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors, {
      createdAt: 'createdAt cannot be set by the client.',
      company: 'company is required.',
    });
  });

  test('malformed application id is keyed as id', async () => {
    const res = await api('GET', '/api/applications/123', { auth: true });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      status: 'error',
      message: 'Validation failed: id must be a valid 24-character hexadecimal ID.',
      errors: { id: 'id must be a valid 24-character hexadecimal ID.' },
    });
  });

  test('pagination errors are keyed by query parameter', async () => {
    const res = await api('GET', '/api/applications?page=0&limit=500&sort=x', { auth: true });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors, {
      sort: 'Unknown query parameter: sort.',
      page: 'page must be a positive integer.',
      limit: 'limit must be at most 100.',
    });
  });

  test('a "__proto__" key is reported as an ordinary field', async () => {
    const res = await api('POST', '/api/applications', { auth: true, rawBody: '{"company":"A","position":"B","__proto__":{"x":1}}' });
    assert.equal(res.status, 400);
    assert.equal(JSON.parse(res.text).errors.__proto__, 'Unknown field: __proto__.');
    assert.ok(res.text.includes('"__proto__":"Unknown field: __proto__."'));
  });

  test('no errors object when no single field is at fault', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const cases = [
      ['PATCH', `/api/applications/${id}`, { auth: true, body: {} }, /at least one field to update/],
      ['POST', '/api/applications', { auth: true, rawBody: '[]' }, /must be a JSON object/],
      ['POST', '/api/auth/login', { rawBody: '{bad' }, /valid JSON/],
    ];
    for (const [method, path, options, message] of cases) {
      const res = await api(method, path, options);
      assert.equal(res.status, 400, path);
      assert.match(res.body.message, message);
      assert.equal('errors' in res.body, false, `${method} ${path} has no errors key`);
    }
  });

  test('non-400 errors never include an errors object', async () => {
    const responses = [
      await api('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password } }), // 401
      await api('GET', '/api/auth/me'), // 401
      await api('POST', '/api/auth/register', { body: { name: 'A', email: 'taken@example.com', password } }), // 409
      await api('GET', `/api/applications/${new mongoose.Types.ObjectId()}`, { auth: true }), // 404
      await api('GET', '/api/nope'), // 404
    ];
    assert.deepEqual(responses.map((r) => r.status), [401, 401, 409, 404, 404]);
    for (const res of responses) assert.deepEqual(Object.keys(res.body).sort(), ['message', 'status']);
  });

  test('Mongoose validation errors are keyed by path without submitted values', async () => {
    const doc = new JobApplication({ user: new mongoose.Types.ObjectId(), position: 'P', status: 'Ghosted', interestLevel: 7 });
    const err = await doc.validate().catch((e) => e);
    const res = runHandler(err);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body.errors, {
      company: 'company is required.',
      status: 'status must be one of: Saved, Applied, Interviewing, Offer, Rejected.',
      interestLevel: 'interestLevel must be an integer from 1 to 5.',
    });
    assert.ok(!JSON.stringify(res.body).includes('Ghosted'));
  });
});

// ---------------------------------------------------------------------------
// 2. expiresAt on login
// ---------------------------------------------------------------------------
describe('login expiresAt', () => {
  test('is an ISO 8601 UTC timestamp equal to the JWT exp claim; other fields unchanged', async () => {
    const before = Date.now();
    const res = await api('POST', '/api/auth/login', { body: { email: 'taken@example.com', password } });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['expiresAt', 'expiresIn', 'token', 'tokenType', 'user']);
    assert.equal(res.body.tokenType, 'Bearer');
    assert.equal(res.body.expiresIn, '1h');
    assert.equal(res.body.user.email, 'taken@example.com');

    const { exp } = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.match(res.body.expiresAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    assert.equal(res.body.expiresAt, new Date(exp * 1000).toISOString());

    const expiresAt = Date.parse(res.body.expiresAt);
    assert.ok(expiresAt >= Math.floor(before / 1000) * 1000 + 3600_000, 'about one hour from now');
    assert.ok(expiresAt <= Date.now() + 3600_000);
  });

  test('getTokenExpiresAt reads the exp claim and rejects tokens without one', () => {
    const exp = 2000000000;
    assert.equal(getTokenExpiresAt(jwt.sign({ exp }, 'x'.repeat(32))), '2033-05-18T03:33:20.000Z');
    assert.throws(() => getTokenExpiresAt(jwt.sign({}, 'x'.repeat(32))), /no exp claim/);
    assert.throws(() => getTokenExpiresAt('not-a-token'), /no exp claim/);
  });
});

// ---------------------------------------------------------------------------
// 3. Malformed JSON and 404 messages
// ---------------------------------------------------------------------------
describe('malformed JSON and route-not-found messages', () => {
  test('malformed JSON returns a generic message without parser details or body content', async () => {
    for (const rawBody of ['{bad', `{"email":"a@b.co","password":"${password}"`, '{"a":1,}']) {
      const res = await api('POST', '/api/auth/login', { rawBody });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { status: 'error', message: 'Request body must be valid JSON.' });
      assert.ok(!res.text.includes(password) && !/position|token/i.test(res.text));
    }
  });

  test('404 messages contain the path but not the query string', async () => {
    const res = await api('GET', '/api/nope?token=secret-value&page=2');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { status: 'error', message: 'Route not found: GET /api/nope' });
  });

  test('other body-parser errors keep their status and message', async () => {
    const res = await api('POST', '/api/auth/login', { body: { email: 'x'.repeat(200_000) } });
    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { status: 'error', message: 'request entity too large' });
  });
});

function runHandler(err) {
  const res = {
    statusCode: null,
    body: null,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  errorHandler(err, { method: 'POST', originalUrl: '/x' }, res, () => assert.fail('next must not be called'));
  return res;
}

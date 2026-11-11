// HTTP tests for the authentication API that do NOT need MongoDB.
// The User model's database methods are replaced by an in-memory store that
// mimics the unique email index, so the real routes, controllers, validation,
// bcrypt hashing and JWT signing/verification are all exercised.

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
// Random per-run secret: never a real secret, never written to disk.
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

const User = require('../src/models/User');
const app = require('../src/app');

// ---------------------------------------------------------------------------
// In-memory replacement for the users collection
// ---------------------------------------------------------------------------
const users = new Map(); // id -> User document

function findByEmail(email) {
  return [...users.values()].find((u) => u.email === email) || null;
}

function installFakeUserStore() {
  mock.method(User, 'exists', async (filter) => (findByEmail(filter.email) ? { _id: 'x' } : null));

  mock.method(User, 'create', async (data) => {
    const doc = new User(data);
    await doc.validate();
    if (findByEmail(doc.email)) {
      // Same shape as MongoDB's unique index violation.
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    }
    const now = new Date();
    doc.createdAt = now;
    doc.updatedAt = now;
    users.set(doc._id.toString(), doc);
    return doc;
  });

  // Mirrors `select: false`: the hash is only present after select('+passwordHash').
  mock.method(User, 'findOne', (filter) => ({
    select: async (projection) => {
      const doc = findByEmail(filter.email);
      if (!doc) return null;
      if (projection === '+passwordHash') return doc;
      const copy = new User(doc.toObject());
      copy.passwordHash = undefined;
      return copy;
    },
  }));

  mock.method(User, 'findById', async (id) => {
    const doc = users.get(String(id));
    if (!doc) return null;
    const copy = new User(doc.toObject());
    copy.passwordHash = undefined;
    return copy;
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
let server;
let baseUrl;
const rawResponseBodies = [];

async function request(method, path, { body, token, rawBody } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  rawResponseBodies.push(text);
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}

const validUser = { name: 'Test User', email: 'test@example.com', password: 'SecurePassword123!' };

const register = (body = validUser) => request('POST', '/api/auth/register', { body });
const login = (body) => request('POST', '/api/auth/login', { body });
const me = (token) => request('GET', '/api/auth/me', { token });

async function registerAndLogin(user = validUser) {
  await register(user);
  const res = await login({ email: user.email, password: user.password });
  return res.body.token;
}

before(async () => {
  installFakeUserStore();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => users.clear());

after(async () => {
  mock.restoreAll();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
test('register: valid data returns 201 with the public user and stores a bcrypt hash', async () => {
  const res = await register({ ...validUser, email: '  Test@Example.COM ' });

  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body.user).sort(), ['createdAt', 'email', 'id', 'name']);
  assert.equal(res.body.user.name, 'Test User');
  assert.equal(res.body.user.email, 'test@example.com', 'email is normalized');

  const stored = users.get(res.body.user.id);
  assert.ok(stored, 'user was stored');
  assert.notEqual(stored.passwordHash, validUser.password, 'plaintext password is not stored');
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/, 'bcrypt hash with work factor 12');
});

test('register: missing fields return 400 naming each missing field', async () => {
  for (const [field, expected] of [['name', /name is required/], ['email', /email is required/], ['password', /password is required/]]) {
    const body = { ...validUser };
    delete body[field];
    const res = await register(body);
    assert.equal(res.status, 400, `missing ${field}`);
    assert.equal(res.body.status, 'error');
    assert.match(res.body.message, expected);
  }

  const empty = await request('POST', '/api/auth/register', { body: {} });
  assert.equal(empty.status, 400);
  assert.match(empty.body.message, /name is required.*email is required.*password is required/);

  const noBody = await request('POST', '/api/auth/register');
  assert.equal(noBody.status, 400, 'request with no body');

  assert.equal(users.size, 0, 'nothing was stored');
});

test('register: non-string fields return 400', async () => {
  const res = await register({ name: 123, email: ['a@b.co'], password: { $gt: '' } });
  assert.equal(res.status, 400);
  assert.equal(users.size, 0);
});

test('register: invalid email returns 400', async () => {
  for (const email of ['not-an-email', 'missing-at.example.com', 'user@nodot', 'two@@example.com', 'sp ace@example.com']) {
    const res = await register({ ...validUser, email });
    assert.equal(res.status, 400, email);
    assert.match(res.body.message, /email must be a valid email address/);
  }
});

test('register: password shorter than 8 characters returns 400', async () => {
  const res = await register({ ...validUser, password: 'Short1!' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /at least 8 characters/);
  assert.ok(!res.body.message.includes('Short1!'), 'password is not echoed back');
});

test('register: password longer than bcrypt\'s 72-byte limit returns 400', async () => {
  const res = await register({ ...validUser, password: 'a'.repeat(73) });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /at most 72 bytes/);
});

test('register: duplicate email (any letter case) returns 409', async () => {
  assert.equal((await register()).status, 201);
  const res = await register({ ...validUser, email: 'TEST@example.com' });
  assert.equal(res.status, 409);
  assert.equal(res.body.message, 'An account with this email already exists.');
  assert.equal(users.size, 1);
});

test('register: duplicate-key error from the unique index (race condition) returns 409', async () => {
  // Simulate two concurrent registrations: the pre-check passes, but the
  // database rejects the insert with error code 11000.
  const existsMock = mock.method(User, 'exists', async () => null);
  try {
    assert.equal((await register()).status, 201);
    const res = await register();
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'An account with this email already exists.');
  } finally {
    existsMock.mock.restore();
  }
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
test('login: correct credentials return 200 with a signed JWT whose subject is the user ID', async () => {
  const { body: { user } } = await register();
  const res = await login({ email: ' TEST@example.com', password: validUser.password });

  assert.equal(res.status, 200);
  assert.equal(res.body.tokenType, 'Bearer');
  assert.equal(res.body.expiresIn, '1h');
  assert.deepEqual(res.body.user, user);

  const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.exp - decoded.iat, 3600, 'expires after one hour');
  assert.deepEqual(Object.keys(decoded).sort(), ['exp', 'iat', 'sub'], 'token holds no other data');
  assert.ok(!JSON.stringify(decoded).includes(validUser.password));
  assert.equal(jwt.decode(res.body.token, { complete: true }).header.alg, 'HS256');
});

test('login: incorrect password and unknown email return the same 401 response', async () => {
  await register();
  const wrongPassword = await login({ email: validUser.email, password: 'WrongPassword123!' });
  const unknownEmail = await login({ email: 'nobody@example.com', password: validUser.password });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, { status: 'error', message: 'Invalid email or password.' });
  assert.deepEqual(unknownEmail.body, wrongPassword.body, 'no user enumeration');
});

test('login: missing fields return 400', async () => {
  assert.equal((await login({ email: validUser.email })).status, 400);
  assert.equal((await login({ password: validUser.password })).status, 400);
  assert.equal((await login({ email: validUser.email, password: { $ne: '' } })).status, 400);
});

// ---------------------------------------------------------------------------
// Protected route: GET /api/auth/me
// ---------------------------------------------------------------------------
test('me: no token returns 401', async () => {
  const res = await me();
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { status: 'error', message: 'Authentication required.' });
  assert.equal(res.headers.get('www-authenticate'), 'Bearer');
});

test('me: non-Bearer Authorization header returns 401', async () => {
  const token = await registerAndLogin();
  const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Basic ${token}` } });
  assert.equal(res.status, 401);
});

test('me: malformed, tampered, wrongly signed, or alg=none tokens return 401 with a generic message', async () => {
  const token = await registerAndLogin();
  const { sub } = jwt.decode(token);
  const [header, payload] = token.split('.');

  const badTokens = {
    malformed: 'not.a.jwt',
    garbage: 'abc',
    tamperedSignature: `${token.slice(0, -4)}AAAA`,
    wrongSecret: jwt.sign({}, 'a-different-secret-that-is-long-enough-123456', { subject: sub, expiresIn: '1h' }),
    algNone: `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`,
    differentAlgorithm: jwt.sign({}, process.env.JWT_SECRET, { subject: sub, algorithm: 'HS512', expiresIn: '1h' }),
    noSubject: jwt.sign({}, process.env.JWT_SECRET, { expiresIn: '1h' }),
    nonObjectIdSubject: jwt.sign({}, process.env.JWT_SECRET, { subject: 'admin', expiresIn: '1h' }),
  };
  assert.ok(header);

  for (const [name, badToken] of Object.entries(badTokens)) {
    const res = await me(badToken);
    assert.equal(res.status, 401, name);
    assert.deepEqual(res.body, { status: 'error', message: 'Invalid or expired token.' }, name);
  }
});

test('me: expired token returns 401', async () => {
  const { body: { user } } = await register();
  const past = Math.floor(Date.now() / 1000) - 7200;
  const expired = jwt.sign({ sub: user.id, iat: past, exp: past + 3600 }, process.env.JWT_SECRET);

  const res = await me(expired);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { status: 'error', message: 'Invalid or expired token.' });
  assert.ok(!/jwt expired/i.test(JSON.stringify(res.body)), 'library error is not exposed');
});

test('me: valid token returns 200 with id, name, email and createdAt only', async () => {
  const { body: { user } } = await register();
  const { body: { token } } = await login({ email: validUser.email, password: validUser.password });

  const res = await me(token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { user });
  assert.deepEqual(Object.keys(res.body.user).sort(), ['createdAt', 'email', 'id', 'name']);
});

test('me: valid token for a deleted user returns 401', async () => {
  const token = await registerAndLogin();
  assert.equal((await me(token)).status, 200);

  users.clear(); // delete the account

  const res = await me(token);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { status: 'error', message: 'User account no longer exists.' });
});

test('CORS preflight allows the Authorization header from the frontend origin', async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization',
    },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(res.headers.get('access-control-allow-headers'), /authorization/i);
});

// ---------------------------------------------------------------------------
// Sensitive data never leaks
// ---------------------------------------------------------------------------
test('no API response in this suite contained a password or password hash', async () => {
  // Make sure each endpoint has produced at least one response first.
  const token = await registerAndLogin();
  await me(token);

  assert.ok(rawResponseBodies.length > 20);
  for (const text of rawResponseBodies) {
    assert.ok(!/passwordHash/i.test(text), `response contains "passwordHash": ${text}`);
    assert.ok(!/\$2[aby]\$\d\d\$/.test(text), `response contains a bcrypt hash: ${text}`);
    assert.ok(!text.includes(validUser.password), `response contains the plaintext password: ${text}`);
  }
});

test('User model JSON serialization omits passwordHash even when it is loaded', () => {
  const doc = new User({ name: 'A', email: 'a@example.com', passwordHash: '$2b$12$abcdefghijklmnopqrstuv' });
  const json = JSON.parse(JSON.stringify(doc));
  assert.equal(json.passwordHash, undefined);
  assert.equal(json._id, undefined);
  assert.equal(typeof json.id, 'string');
});

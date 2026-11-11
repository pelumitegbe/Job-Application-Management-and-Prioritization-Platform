// Tests for HTTP request logging (Morgan) and server-error logging.
// No database: the few model calls needed are replaced with mocks.

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');

const defaultApp = require('../src/app');
const { createApp } = require('../src/app');
const { isHttpLoggingEnabled, parseHttpLogging } = require('../src/middleware/requestLogger');
const errorHandler = require('../src/middleware/errorHandler');
const { redact } = require('../src/utils/logSafety');
const { signAccessToken } = require('../src/services/tokenService');
const User = require('../src/models/User');
const JobApplication = require('../src/models/JobApplication');

const ANSI = /\x1b\[\d+m/g;
const stripAnsi = (text) => text.replace(ANSI, '');

// ---------------------------------------------------------------------------
// Test servers: one with logging captured in memory, one with logging off
// ---------------------------------------------------------------------------
const logLines = [];
const logStream = { write: (line) => logLines.push(line) };

// Close idle keep-alive connections too, so the suite doesn't wait for them to time out.
function stop(server) {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
}

async function start(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

let logged; // logging enabled, captured
let silent; // logging disabled
let consoleError;
const userId = new mongoose.Types.ObjectId().toString();
const token = signAccessToken(userId);
const password = 'SuperSecretPassword123!';

// Morgan writes its line when the response finishes, which can be just after
// the client has received it, so wait briefly for the expected number of lines.
async function waitForLines(count) {
  for (let i = 0; i < 100 && logLines.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return logLines.slice(-1)[0];
}

async function call(target, method, path, { body, headers = {} } = {}) {
  const before = logLines.length;
  const res = await fetch(`${target.baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: typeof body === 'string' ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (target === logged) await waitForLines(before + 1);
  return { res, text, newLines: logLines.slice(before) };
}

before(async () => {
  // Minimal model mocks so success (201/204) and server-error (500) paths run.
  // Registration checks by email (no existing user); application creation checks by _id.
  mock.method(User, 'exists', async (filter) => (filter._id ? { _id: userId } : null));
  mock.method(User, 'findOne', () => ({ select: async () => null })); // login: unknown user -> 401
  mock.method(User, 'findById', async () => null); // /me: deleted user -> 401
  mock.method(User, 'create', async (data) => {
    const doc = new User(data);
    doc.createdAt = new Date('2026-11-11T00:00:00Z');
    return doc;
  });
  mock.method(JobApplication, 'deleteOne', async () => ({ deletedCount: 1 }));
  mock.method(JobApplication, 'find', () => {
    throw new Error('connection to mongodb+srv://dbuser:dbpassword@cluster0.example.net failed');
  });

  logged = await start(createApp({ httpLogging: true, httpLogStream: logStream }));
  silent = await start(createApp({ httpLogging: false }));
});

beforeEach(() => {
  consoleError = mock.method(console, 'error', () => {});
});

after(async () => {
  mock.restoreAll();
  for (const { server } of [logged, silent]) await stop(server);
});

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------
describe('HTTP request logging (Morgan dev format)', () => {
  test('a successful request is logged once with method, path, green status, time and size', async () => {
    const { res, newLines } = await call(logged, 'GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(newLines.length, 1, 'exactly one log line per request');

    const line = newLines[0];
    assert.match(line, /\x1b\[32m200\x1b\[0m/, 'status is green');
    assert.match(stripAnsi(line), /^GET \/api\/health 200 \d+\.\d{3} ms - \d+\n$/);
    assert.match(stripAnsi(line), new RegExp(` - ${res.headers.get('content-length')}\\n$`), 'response size');
  });

  test('client errors are logged in yellow with their status code', async () => {
    const cases = [
      ['GET', '/api/applications', {}, 401],
      ['GET', '/api/missing', {}, 404],
      ['POST', '/api/auth/register', { body: { name: 'A' } }, 400],
      ['POST', '/api/auth/login', { body: '{bad json' }, 400],
    ];
    for (const [method, path, options, status] of cases) {
      const { res, newLines } = await call(logged, method, path, options);
      assert.equal(res.status, status);
      assert.equal(newLines.length, 1);
      assert.match(newLines[0], new RegExp(`\\x1b\\[33m${status}\\x1b\\[0m`), `${status} is yellow`);
      assert.match(stripAnsi(newLines[0]), new RegExp(`^${method} ${path} ${status} \\d+\\.\\d{3} ms`));
    }
  });

  test('server errors are logged in red with status 500', async () => {
    const { res, newLines } = await call(logged, 'GET', '/api/applications', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 500);
    assert.equal(newLines.length, 1);
    assert.match(newLines[0], /\x1b\[31m500\x1b\[0m/, '500 is red');
  });

  test('201 and 204 responses are logged; 204 shows no size', async () => {
    const created = await call(logged, 'POST', '/api/auth/register', { body: { name: 'Log Test', email: 'log@example.com', password } });
    assert.equal(created.res.status, 201);
    assert.match(stripAnsi(created.newLines[0]), /^POST \/api\/auth\/register 201 \d+\.\d{3} ms - \d+\n$/);

    const id = new mongoose.Types.ObjectId().toString();
    const deleted = await call(logged, 'DELETE', `/api/applications/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(deleted.res.status, 204);
    assert.match(stripAnsi(deleted.newLines[0]), new RegExp(`^DELETE /api/applications/${id} 204 \\d+\\.\\d{3} ms - -\\n$`));
  });

  test('query-string values are never logged', async () => {
    // (The API rejects the unknown `token` parameter with 400; the log line must still omit it.)
    const { newLines } = await call(logged, 'GET', '/api/applications?page=2&limit=10&token=query-secret-value', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const line = stripAnsi(newLines[0]);
    assert.match(line, /^GET \/api\/applications 400 /);
    assert.ok(!line.includes('?'), 'no query string');
    assert.ok(!line.includes('query-secret-value'));
    assert.ok(!line.includes('page=2'));
  });

  test('passwords, JWTs, Authorization headers and cookies are never logged', async () => {
    await call(logged, 'POST', '/api/auth/login', {
      body: { email: 'log@example.com', password },
      headers: { Cookie: 'session=cookie-secret-value', Authorization: `Bearer ${token}` },
    });
    await call(logged, 'GET', '/api/auth/me', { headers: { Authorization: `Bearer ${token}`, Cookie: 'session=cookie-secret-value' } });

    const allLogs = logLines.join('');
    for (const secret of [password, token, 'Bearer', 'cookie-secret-value', process.env.JWT_SECRET, 'log@example.com']) {
      assert.ok(!allLogs.includes(secret), `logs must not contain ${secret.slice(0, 12)}...`);
    }
  });

  test('CORS preflight requests are logged once', async () => {
    const { res, newLines } = await call(logged, 'OPTIONS', '/api/applications', {
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(res.status, 204);
    assert.equal(newLines.length, 1);
    assert.match(stripAnsi(newLines[0]), /^OPTIONS \/api\/applications 204 /);
  });

  test('a disabled logger writes nothing', async () => {
    const before = logLines.length;
    const stdoutWrite = mock.method(process.stdout, 'write');
    try {
      await call(silent, 'GET', '/api/health');
      await call(silent, 'GET', '/api/missing');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const morganLike = stdoutWrite.mock.calls.filter(({ arguments: [chunk] }) => /\/api\/(health|missing)/.test(String(chunk)));
      assert.equal(morganLike.length, 0, 'nothing written to stdout');
    } finally {
      stdoutWrite.mock.restore();
    }
    assert.equal(logLines.length, before);
  });

  test('logging does not alter HTTP responses', async () => {
    const authed = { Authorization: `Bearer ${token}` };
    const requests = [
      ['GET', '/api/health', {}],
      ['GET', '/api/missing?x=1', {}],
      ['POST', '/api/auth/login', { body: '{bad' }],
      ['POST', '/api/auth/register', { body: { email: 'bad' } }],
      ['POST', '/api/auth/register', { body: { name: 'A', email: 'same@example.com', password } }],
      ['GET', '/api/auth/me', {}],
      ['GET', '/api/applications', { headers: authed }],
      ['GET', '/api/applications/123', { headers: authed }],
      ['PATCH', `/api/applications/${userId}`, { headers: authed, body: {} }],
      ['DELETE', `/api/applications/${userId}`, { headers: authed }],
      ['OPTIONS', '/api/auth/login', { headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } }],
    ];

    const comparableHeaders = (res) =>
      Object.fromEntries([...res.headers].filter(([name]) => !['date', 'keep-alive', 'connection'].includes(name)));

    for (const [method, path, options] of requests) {
      const withLogs = await call(logged, method, path, options);
      const withoutLogs = await call(silent, method, path, options);
      const label = `${method} ${path}`;
      assert.equal(withLogs.res.status, withoutLogs.res.status, label);
      // Registration responses contain a fresh id/timestamp; compare their shape instead.
      if (path === '/api/auth/register' && withLogs.res.status === 201) {
        assert.deepEqual(Object.keys(JSON.parse(withLogs.text).user).sort(), Object.keys(JSON.parse(withoutLogs.text).user).sort());
      } else {
        assert.equal(withLogs.text, withoutLogs.text, label);
        assert.deepEqual(comparableHeaders(withLogs.res), comparableHeaders(withoutLogs.res), label);
      }
    }
  });

  test('the default app used by the test suite has logging disabled', async () => {
    const target = await start(defaultApp);
    const stdoutWrite = mock.method(process.stdout, 'write');
    try {
      await fetch(`${target.baseUrl}/api/health`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(stdoutWrite.mock.calls.filter(({ arguments: [c] }) => String(c).includes('/api/health')).length, 0);
    } finally {
      stdoutWrite.mock.restore();
      await stop(target.server);
    }
  });
});

describe('HTTP_LOGGING configuration', () => {
  test('parses true/false values case-insensitively', () => {
    for (const value of ['true', 'TRUE', '1', 'on', 'yes', ' true ']) assert.equal(parseHttpLogging(value), true, value);
    for (const value of ['false', 'False', '0', 'off', 'no']) assert.equal(parseHttpLogging(value), false, value);
    assert.equal(parseHttpLogging(undefined), undefined);
    assert.equal(parseHttpLogging(''), undefined);
    assert.equal(parseHttpLogging('maybe'), null, 'invalid');
  });

  test('is on by default in development and off by default in tests', () => {
    assert.equal(isHttpLoggingEnabled({}), true, 'development default');
    assert.equal(isHttpLoggingEnabled({ NODE_ENV: 'development' }), true);
    assert.equal(isHttpLoggingEnabled({ NODE_ENV: 'test' }), false);
    assert.equal(isHttpLoggingEnabled({ NODE_TEST_CONTEXT: 'child-v8' }), false, 'node --test');
  });

  test('HTTP_LOGGING overrides the default in either direction', () => {
    assert.equal(isHttpLoggingEnabled({ HTTP_LOGGING: 'false' }), false);
    assert.equal(isHttpLoggingEnabled({ HTTP_LOGGING: 'true', NODE_ENV: 'test' }), true);
    assert.equal(isHttpLoggingEnabled({ HTTP_LOGGING: 'true', NODE_TEST_CONTEXT: 'child' }), true);
  });
});

// ---------------------------------------------------------------------------
// Server-error logging
// ---------------------------------------------------------------------------
describe('error logging', () => {
  test('an unexpected error is logged once with diagnostics; the client gets a generic 500', async () => {
    const { res, text } = await call(silent, 'GET', '/api/applications?page=1&limit=5', {
      headers: { Authorization: `Bearer ${token}`, Cookie: 'sid=cookie-secret' },
    });
    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(text), { status: 'error', message: 'Internal server error' });
    assert.ok(!text.includes('mongodb') && !text.includes('at '), 'no internals sent to the client');

    assert.equal(consoleError.mock.callCount(), 1, 'logged exactly once');
    const logged = consoleError.mock.calls[0].arguments.join(' ');
    assert.match(logged, /^\[error\] 500 GET \/api\/applications\n/);
    assert.match(logged, /Error: connection to mongodb\+srv:\/\/<credentials>@cluster0\.example\.net failed/);
    assert.match(logged, /\n\s+at /, 'includes the stack trace');
    for (const secret of ['dbpassword', 'dbuser', token, 'cookie-secret', 'limit=5', 'page=1']) {
      assert.ok(!logged.includes(secret), `must not log ${secret.slice(0, 12)}`);
    }
  });

  test('expected client errors (400, 401, 404, 409-style) are not logged with stack traces', async () => {
    await call(silent, 'GET', '/api/auth/me');
    await call(silent, 'GET', '/api/auth/me', { headers: { Authorization: 'Bearer not.a.jwt' } });
    await call(silent, 'POST', '/api/auth/login', { body: `{"email":"a@b.co","password":"${password}"` });
    await call(silent, 'POST', '/api/applications', { headers: { Authorization: `Bearer ${token}` }, body: { company: 'A' } });
    await call(silent, 'GET', '/api/applications/zzz', { headers: { Authorization: `Bearer ${token}` } });
    await call(silent, 'GET', '/nowhere');
    assert.equal(consoleError.mock.callCount(), 0);
  });

  test('the cause chain is logged and redacted', () => {
    const cause = new Error('auth failed for mongodb://admin:hunter2@localhost:27017');
    const err = new Error('Failed to save', { cause });
    runHandler(err);
    const logged = consoleError.mock.calls[0].arguments[0];
    assert.match(logged, /Caused by: Error: auth failed for mongodb:\/\/<credentials>@localhost:27017/);
    assert.ok(!logged.includes('hunter2'));
  });

  test('a thrown non-Error value is logged by type only and still returns 500', () => {
    const res = runHandler({ password: 'should-not-be-logged' });
    assert.equal(res.statusCode, 500);
    const logged = consoleError.mock.calls[0].arguments[0];
    assert.match(logged, /Non-Error value thrown \(type: object\)/);
    assert.ok(!logged.includes('should-not-be-logged'));
  });

  test('invalid status codes on errors fall back to 500', () => {
    for (const status of [200, 302, 600, '404', undefined]) {
      const err = Object.assign(new Error('x'), { status });
      assert.equal(runHandler(err).statusCode, 500, String(status));
    }
  });

  test('client error statuses and messages are preserved', () => {
    const err = Object.assign(new Error('Application not found.'), { status: 404 });
    const res = runHandler(err);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { status: 'error', message: 'Application not found.' });
    assert.equal(consoleError.mock.callCount(), 0);
  });

  test('if headers were already sent, the error is logged and passed to Express (not swallowed)', () => {
    const err = new Error('stream broke');
    let forwarded;
    const res = { headersSent: true, status: () => assert.fail('must not write a second response') };
    errorHandler(err, { method: 'GET', originalUrl: '/api/x?y=1' }, res, (e) => { forwarded = e; });
    assert.equal(forwarded, err);
    assert.equal(consoleError.mock.callCount(), 1);
    assert.match(consoleError.mock.calls[0].arguments[0], /^\[error\] 500 GET \/api\/x\n/);
  });

  test('redact removes connection-string credentials, bearer tokens and JWTs', () => {
    assert.equal(redact('mongodb+srv://u:p@h/db'), 'mongodb+srv://<credentials>@h/db');
    assert.equal(redact('mongodb://u@h'), 'mongodb://<credentials>@h');
    assert.equal(redact('Authorization: Bearer abc.def'), 'Authorization: Bearer <redacted>');
    assert.equal(redact(`token ${token} end`), 'token <jwt> end');
    assert.equal(redact('nothing sensitive'), 'nothing sensitive');
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
  errorHandler(err, { method: 'POST', originalUrl: '/api/test?q=secret' }, res, () => assert.fail('next must not be called'));
  return res;
}

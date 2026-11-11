const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

// Configure CORS explicitly without loading .env or connecting to MongoDB.
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
const app = require('../src/app');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});

test('health returns HTTP 200 and the expected JSON', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    message: 'Job Application Platform API is running',
  });
});

test('unknown routes return HTTP 404', async () => {
  const response = await fetch(`${baseUrl}/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    status: 'error', message: 'Route not found: GET /missing',
  });
});

test('invalid JSON returns HTTP 400', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.status, 'error');
  assert.equal(typeof body.message, 'string');
});

test('allowed browser origin receives CORS permission without credentials', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: process.env.FRONTEND_ORIGIN },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), process.env.FRONTEND_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('disallowed browser origin does not receive matching CORS permission', async () => {
  const origin = 'https://untrusted.example';
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  assert.notEqual(response.headers.get('access-control-allow-origin'), origin);
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

for (const origin of ['http://localhost:5173', 'https://untrusted.example']) {
  test(`preflight applies origin restriction for ${origin}`, async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type' },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), process.env.FRONTEND_ORIGIN);
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
    assert.match(response.headers.get('access-control-allow-headers'), /content-type/i);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  });
}

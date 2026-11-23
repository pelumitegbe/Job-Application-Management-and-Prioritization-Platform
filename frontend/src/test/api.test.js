import { afterEach, describe, expect, test, vi } from 'vitest';
import { apiRequest, ApiError, NetworkError, setUnauthorizedHandler } from '../services/api';
import { jsonResponse, storeSession } from './helpers';

function stubFetch(impl) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let removeHandler = () => {};
afterEach(() => removeHandler());

describe('apiRequest', () => {
  test('uses VITE_API_BASE_URL, sends JSON and parses the JSON response', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { user: { id: '1' } }));
    const data = await apiRequest('/api/auth/register', { method: 'POST', body: { name: 'A' }, auth: false });

    expect(data).toEqual({ user: { id: '1' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/auth/register');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"A"}');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Accept).toBe('application/json');
  });

  test('strips a trailing slash from the base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/');
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await apiRequest('/api/health');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/health');
  });

  test('reports a clear error when VITE_API_BASE_URL is missing', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    stubFetch(async () => jsonResponse(200, {}));
    await expect(apiRequest('/api/health')).rejects.toThrow(/VITE_API_BASE_URL is not set/);
  });

  test('adds the Bearer token when a session exists', async () => {
    storeSession({ token: 'abc.def.ghi' });
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await apiRequest('/api/auth/me');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc.def.ghi');
  });

  test('omits the token for auth: false requests and when there is no session', async () => {
    storeSession({ token: 'abc.def.ghi' });
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await apiRequest('/api/auth/login', { method: 'POST', body: {}, auth: false });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();

    window.sessionStorage.clear();
    await apiRequest('/api/health');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  test('does not send an expired token', async () => {
    storeSession({ token: 'old.token.value', expiresAt: new Date(Date.now() - 1000).toISOString() });
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await apiRequest('/api/auth/me');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test('handles 204 No Content without parsing JSON', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    await expect(apiRequest('/api/applications/1', { method: 'DELETE' })).resolves.toBeNull();
  });

  test('API errors keep the backend status, message and field errors', async () => {
    stubFetch(async () =>
      jsonResponse(400, {
        status: 'error',
        message: 'Validation failed: email must be a valid email address.',
        errors: { email: 'email must be a valid email address.' },
      })
    );
    const error = await apiRequest('/api/auth/register', { method: 'POST', body: {}, auth: false }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Validation failed: email must be a valid email address.');
    expect(error.fieldErrors).toEqual({ email: 'email must be a valid email address.' });
  });

  test('errors without a JSON body get a readable fallback message', async () => {
    stubFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await apiRequest('/api/health').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message).toBe('Something went wrong on the server. Please try again.');
    expect(error.fieldErrors).toEqual({});
  });

  test('a successful non-JSON response is reported as unexpected', async () => {
    stubFetch(async () => new Response('<html></html>', { status: 200 }));
    await expect(apiRequest('/api/health')).rejects.toThrow('The server returned an unexpected response.');
  });

  test('network failures become NetworkError, distinct from API errors', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await apiRequest('/api/health').catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.message).toMatch(/Unable to reach the server/);
  });

  test('slow responses time out with a NetworkError', async () => {
    stubFetch((url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
    await expect(apiRequest('/api/health', { timeoutMs: 20 })).rejects.toThrow(/took too long/);
  });

  test('requests are never retried, including failed POSTs', async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await apiRequest('/api/applications', { method: 'POST', body: {} }).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => jsonResponse(500, { status: 'error', message: 'Internal server error' }));
    await apiRequest('/api/applications', { method: 'POST', body: {} }).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a 401 on an authenticated request calls the unauthorized handler', async () => {
    const handler = vi.fn();
    removeHandler = setUnauthorizedHandler(handler);
    storeSession({ token: 'abc.def.ghi' });
    stubFetch(async () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }));

    const error = await apiRequest('/api/auth/me').catch((e) => e);
    expect(error.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('a 401 from login (no token sent) does not call the unauthorized handler', async () => {
    const handler = vi.fn();
    removeHandler = setUnauthorizedHandler(handler);
    storeSession({ token: 'abc.def.ghi' });
    stubFetch(async () => jsonResponse(401, { status: 'error', message: 'Invalid email or password.' }));

    const error = await apiRequest('/api/auth/login', { method: 'POST', body: {}, auth: false }).catch((e) => e);
    expect(error.message).toBe('Invalid email or password.');
    expect(handler).not.toHaveBeenCalled();
  });

  test('never logs tokens or request bodies', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    storeSession({ token: 'secret.token.value' });
    stubFetch(async () => jsonResponse(401, { status: 'error', message: 'Invalid or expired token.' }));
    await apiRequest('/api/auth/me').catch(() => {});
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await apiRequest('/api/auth/login', { method: 'POST', body: { password: 'Secret123!' }, auth: false }).catch(() => {});

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

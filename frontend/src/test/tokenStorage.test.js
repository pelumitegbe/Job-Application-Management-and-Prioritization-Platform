import { describe, expect, test } from 'vitest';
import { clearSession, getToken, loadSession, saveSession } from '../services/tokenStorage';
import { inOneHour } from './helpers';

describe('tokenStorage', () => {
  test('saves the token and expiry in sessionStorage', () => {
    const expiresAt = inOneHour();
    saveSession({ token: 'a.b.c', expiresAt });
    expect(loadSession()).toEqual({ token: 'a.b.c', expiresAt });
    expect(getToken()).toBe('a.b.c');
    expect(JSON.parse(window.sessionStorage.getItem('jobAppPlatform.session')).token).toBe('a.b.c');
  });

  test('stores only the token and expiry', () => {
    saveSession({ token: 'a.b.c', expiresAt: inOneHour(), user: { name: 'x' }, password: 'nope' });
    const stored = JSON.parse(window.sessionStorage.getItem('jobAppPlatform.session'));
    expect(Object.keys(stored).sort()).toEqual(['expiresAt', 'token']);
  });

  test('an expired session is reported once and removed', () => {
    saveSession({ token: 'a.b.c', expiresAt: new Date(Date.now() - 1).toISOString() });
    expect(loadSession()).toEqual({ expired: true });
    expect(loadSession()).toBeNull();
    expect(getToken()).toBeNull();
  });

  test('corrupt or incomplete data is discarded', () => {
    window.sessionStorage.setItem('jobAppPlatform.session', '{not json');
    expect(loadSession()).toBeNull();
    window.sessionStorage.setItem('jobAppPlatform.session', JSON.stringify({ token: 'a.b.c' }));
    expect(loadSession()).toBeNull();
    expect(window.sessionStorage.getItem('jobAppPlatform.session')).toBeNull();
  });

  test('clearSession removes the session', () => {
    saveSession({ token: 'a.b.c', expiresAt: inOneHour() });
    clearSession();
    expect(getToken()).toBeNull();
  });
});

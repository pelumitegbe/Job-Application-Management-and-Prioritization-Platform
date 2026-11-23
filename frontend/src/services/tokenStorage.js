// Stores the JWT and its expiry in sessionStorage, which is cleared when the
// browser tab is closed.
//
// SECURITY NOTE: sessionStorage is readable by any JavaScript running on this
// origin, so a cross-site scripting (XSS) bug could steal the token. It is
// NOT equivalent to an HttpOnly cookie, which scripts cannot read. It is used
// here because the backend issues bearer tokens in the response body.
//
// Only the token and expiry are stored, never passwords or user details.

const STORAGE_KEY = 'jobAppPlatform.session';

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage disabled (e.g. strict privacy settings)
  }
}

export function saveSession({ token, expiresAt }) {
  storage()?.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

export function clearSession() {
  storage()?.removeItem(STORAGE_KEY);
}

/**
 * Returns { token, expiresAt } for a stored, unexpired session;
 * { expired: true } if the stored session has expired (it is removed);
 * or null if there is no usable session.
 */
export function loadSession(now = Date.now()) {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return null;

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    clearSession();
    return null;
  }

  const expiresAtMs = Date.parse(session?.expiresAt);
  if (typeof session?.token !== 'string' || !session.token || Number.isNaN(expiresAtMs)) {
    clearSession();
    return null;
  }
  if (expiresAtMs <= now) {
    clearSession();
    return { expired: true };
  }
  return { token: session.token, expiresAt: session.expiresAt };
}

/** The current token, or null if there is none or it has expired. */
export function getToken() {
  const session = loadSession();
  return session?.token ?? null;
}

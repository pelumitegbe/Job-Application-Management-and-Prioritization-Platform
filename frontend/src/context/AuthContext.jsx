import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as authService from '../services/authService';
import { ApiError, setUnauthorizedHandler } from '../services/api';
import { clearSession, loadSession, saveSession } from '../services/tokenStorage';

export const AuthContext = createContext(null);

export const AUTH_STATUS = {
  INITIALIZING: 'initializing',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
};

export const SESSION_MESSAGES = {
  expired: 'Your session has expired. Please log in again.',
  invalid: 'Your session is no longer valid. Please log in again.',
  loggedOut: 'You have been logged out.',
  unreachable: "We couldn't reach the server to restore your session. Make sure the backend is running, then try again.",
};

// setTimeout's maximum delay (~24.8 days); longer delays would fire immediately.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Holds the authenticated user and session state.
 *
 * The user is only treated as authenticated after the server has confirmed
 * the token: via the login response, or via GET /api/auth/me when the app
 * loads with a stored token. The JWT is never decoded or trusted on its own.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.INITIALIZING);
  const [user, setUser] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  // A message for the login page, e.g. after expiry: { type: 'info' | 'error', text }.
  const [notice, setNotice] = useState(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const endSession = useCallback((reason) => {
    clearSession();
    setUser(null);
    setExpiresAt(null);
    setStatus(AUTH_STATUS.UNAUTHENTICATED);
    if (reason) {
      setNotice({ type: reason === 'loggedOut' ? 'info' : 'error', text: SESSION_MESSAGES[reason] });
    }
  }, []);

  // Restore and verify a stored session when the app loads.
  useEffect(() => {
    const session = loadSession();
    if (!session) {
      setStatus(AUTH_STATUS.UNAUTHENTICATED);
      return undefined;
    }
    if (session.expired) {
      endSession('expired');
      return undefined;
    }

    const controller = new AbortController();
    authService
      .getCurrentUser({ signal: controller.signal })
      .then((currentUser) => {
        setUser(currentUser);
        setExpiresAt(session.expiresAt);
        setStatus(AUTH_STATUS.AUTHENTICATED);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          endSession('invalid');
        } else {
          // Server unreachable or failing: keep the stored token so a later
          // reload can retry, but don't treat the user as logged in.
          setStatus(AUTH_STATUS.UNAUTHENTICATED);
          setNotice({ type: 'error', text: SESSION_MESSAGES.unreachable });
        }
      });

    return () => controller.abort();
  }, [endSession]);

  // Any authenticated request that gets 401 ends the session.
  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        if (statusRef.current === AUTH_STATUS.AUTHENTICATED) endSession('invalid');
      }),
    [endSession]
  );

  // Log out automatically when the token expires (from the login response's expiresAt).
  useEffect(() => {
    if (status !== AUTH_STATUS.AUTHENTICATED || !expiresAt) return undefined;
    const delay = Date.parse(expiresAt) - Date.now();
    if (delay <= 0) {
      endSession('expired');
      return undefined;
    }
    const timer = setTimeout(() => endSession('expired'), Math.min(delay, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [status, expiresAt, endSession]);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    saveSession({ token: result.token, expiresAt: result.expiresAt });
    setUser(result.user);
    setExpiresAt(result.expiresAt);
    setNotice(null);
    setStatus(AUTH_STATUS.AUTHENTICATED);
    return result.user;
  }, []);

  const logout = useCallback(() => endSession('loggedOut'), [endSession]);

  // Saves the time zone preference; views that depend on it (priorities) react to user.timezone.
  const updateTimeZone = useCallback(async (timezone) => {
    const updated = await authService.updateTimeZone(timezone);
    setUser(updated);
    return updated;
  }, []);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === AUTH_STATUS.AUTHENTICATED,
      isInitializing: status === AUTH_STATUS.INITIALIZING,
      expiresAt,
      notice,
      login,
      logout,
      clearNotice,
      updateTimeZone,
    }),
    [user, status, expiresAt, notice, login, logout, clearNotice, updateTimeZone]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

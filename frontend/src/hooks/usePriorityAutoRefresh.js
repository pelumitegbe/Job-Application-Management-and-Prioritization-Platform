import { useEffect, useRef } from 'react';
import { calendarDateInTimeZone, nextLocalMidnight } from '../utils/timezone';

// Wait a moment past midnight so the server's clock has certainly passed it too.
export const MIDNIGHT_GRACE_MS = 2000;
// setTimeout's maximum delay; longer delays would fire immediately.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Keeps priority scores from going stale. Scores are computed for one calendar
 * date (`referenceDate`) in one time zone (`timezone`), both from the API's
 * `scoring` metadata. This hook calls `refresh()`:
 *   - at the next local midnight in that time zone (rescheduled after every load);
 *   - when the tab becomes visible again, if the local date has changed;
 *   - when the browser comes back online, if the date has changed or the last
 *     load failed.
 * It never polls, and it skips a refresh while one is already running.
 */
export function usePriorityAutoRefresh({ timezone, referenceDate, loadedAt, isLoading, hasError, refresh }) {
  const latest = useRef({});
  latest.current = { timezone, referenceDate, isLoading, hasError, refresh };

  // A date change is checked against the browser clock, in the scoring time zone.
  function isStale() {
    const { timezone: zone, referenceDate: date } = latest.current;
    if (!zone || !date) return false;
    return calendarDateInTimeZone(new Date(), zone) !== date;
  }

  // A: local midnight. Rescheduled whenever new data arrives (loadedAt) or the time zone changes.
  useEffect(() => {
    if (!timezone || !referenceDate) return undefined;
    const now = new Date();
    const delay = Math.min(nextLocalMidnight(now, timezone).getTime() - now.getTime() + MIDNIGHT_GRACE_MS, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => {
      if (!latest.current.isLoading && isStale()) latest.current.refresh();
    }, delay);
    return () => clearTimeout(timer);
  }, [timezone, referenceDate, loadedAt]);

  // B and C: returning to the tab, and reconnecting.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !latest.current.isLoading && isStale()) latest.current.refresh();
    }
    function onOnline() {
      if (!latest.current.isLoading && (isStale() || latest.current.hasError)) latest.current.refresh();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}

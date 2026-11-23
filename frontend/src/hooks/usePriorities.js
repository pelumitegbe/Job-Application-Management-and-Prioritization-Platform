import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAllPriorities, getPriorities } from '../services/applicationService';
import { onApplicationsChanged } from '../services/applicationEvents';
import { useAuth } from './useAuth';
import { usePriorityAutoRefresh } from './usePriorityAutoRefresh';

/**
 * Loads backend-ranked priority data and keeps it fresh.
 * - One request at a time: a new load aborts the previous one, and only the
 *   newest request may update state, so a slow old response can't overwrite
 *   newer data. Nothing updates after unmount.
 * - Several refresh triggers in the same moment (e.g. an edit plus a manual
 *   reload) are merged into one request.
 * - Reloads when applications change, when the user's time zone changes, at
 *   local midnight, and on tab return / reconnect if the date has changed.
 * `load(signal)` resolves to data; `scoringOf(data)` returns its { timezone, referenceDate }.
 */
function usePriorityData(load, scoringOf) {
  const { user } = useAuth();
  const userTimeZone = user?.timezone;
  const [state, setState] = useState({ data: null, error: null, isLoading: true, loadedAt: 0 });
  const controllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);

  const run = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    load(controller.signal)
      .then((data) => {
        if (requestId === requestIdRef.current) setState({ data, error: null, isLoading: false, loadedAt: Date.now() });
      })
      .catch((error) => {
        if (requestId === requestIdRef.current && !controller.signal.aborted) setState((s) => ({ ...s, error, isLoading: false }));
      });
  }, [load]);

  // Merge refresh requests made in the same tick into a single load.
  const reload = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    queueMicrotask(() => {
      pendingRef.current = false;
      run();
    });
  }, [run]);

  // Initial load, and again whenever the saved time zone changes (scores depend on it).
  useEffect(() => {
    run();
    return () => {
      controllerRef.current?.abort();
      requestIdRef.current += 1; // ignore anything still in flight
    };
  }, [run, userTimeZone]);

  // D: creating, editing or deleting an application changes the ranking.
  useEffect(() => onApplicationsChanged(reload), [reload]);

  const scoring = state.data ? scoringOf(state.data) : {};
  usePriorityAutoRefresh({
    timezone: scoring.timezone ?? userTimeZone,
    referenceDate: scoring.referenceDate,
    loadedAt: state.loadedAt,
    isLoading: state.isLoading,
    hasError: Boolean(state.error),
    refresh: reload,
  });

  return { data: state.data, error: state.error, isLoading: state.isLoading, reload };
}

const loadAll = (signal) => fetchAllPriorities({ signal });
const scoringOfAll = (data) => ({ timezone: data.timezone, referenceDate: data.referenceDate });

/** Full backend ranking for the Priorities page (bounded, sequential). */
export function usePriorities() {
  return usePriorityData(loadAll, scoringOfAll);
}

const scoringOfPage = (data) => ({ timezone: data.scoring?.timezone, referenceDate: data.scoring?.referenceDate });

/** The top N actionable applications (one request: ?limit=N), for the dashboard. */
export function useTopPriorities(count = 3) {
  const load = useCallback((signal) => getPriorities({ page: 1, limit: count, signal }), [count]);
  return usePriorityData(load, scoringOfPage);
}

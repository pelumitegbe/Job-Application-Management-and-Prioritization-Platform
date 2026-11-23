import { useCallback, useEffect, useState } from 'react';
import { fetchAllApplications } from '../services/applicationService';
import { computeStats } from '../utils/applicationStats';

/**
 * Loads the user's applications (bounded, sequential pagination; see
 * fetchAllApplications) and derives dashboard statistics from them.
 * Returns { stats, recent, total, complete, isLoading, error, reload }.
 */
export function useApplicationStats({ recentCount = 3 } = {}) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchAllApplications({ signal: controller.signal })
      .then(({ applications, total, complete }) => {
        const stats = computeStats(applications);
        // `total` comes from the backend's pagination metadata, so it is exact
        // even if the page cap stopped the loop early.
        setResult({ stats: { ...stats, total }, recent: applications.slice(0, recentCount), total, complete });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadToken, recentCount]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { ...(result || { stats: null, recent: [], total: null, complete: true }), isLoading, error, reload };
}

import { useCallback, useEffect, useState } from 'react';
import { listApplications } from '../services/applicationService';

/**
 * Loads one page of the user's applications from the backend.
 * - Cancels the previous request when the page changes or the component unmounts.
 * - Keeps the previous page's data while the next page loads (`isFetching`),
 *   so the list doesn't flash empty between pages.
 * - `reload()` refetches the current page (e.g. after creating an application).
 */
export function useApplications({ page, limit }) {
  const [data, setData] = useState(null); // { applications, pagination }
  const [error, setError] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsFetching(true);
    setError(null);

    listApplications({ page, limit, signal: controller.signal })
      .then((result) => {
        setData(result);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // A 401 also ends the session (AuthContext); the route guard then redirects.
        setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsFetching(false);
      });

    return () => controller.abort();
  }, [page, limit, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { data, error, isFetching, isInitialLoad: isFetching && !data, reload };
}

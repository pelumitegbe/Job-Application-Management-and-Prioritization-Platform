import { useCallback, useRef, useState } from 'react';

/**
 * Tracks a form's submitting state and ignores repeat submissions while a
 * request is in flight (a ref is used so even rapid double-clicks are blocked
 * before React re-renders the disabled button).
 */
export function useFormSubmission() {
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (task) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submitting, run };
}

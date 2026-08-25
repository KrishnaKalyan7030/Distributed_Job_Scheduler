import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Polls `fetchFn` every `intervalMs` and keeps `data` fresh. This is the
 * "live updates" mechanism for the dashboard (see design-decisions doc for
 * why polling was chosen over WebSockets for this project's time budget:
 * it's simpler, has no extra server-side connection management, and at
 * 2-3s intervals is visually indistinguishable from push-based updates for
 * a dashboard like this).
 */
export function usePolling(fetchFn, intervalMs = 3000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const savedFetch = useRef(fetchFn);
  savedFetch.current = fetchFn;

  const refresh = useCallback(async () => {
    try {
      const result = await savedFetch.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      if (cancelled) return;
      await refresh();
      timer = setTimeout(tick, intervalMs);
    }
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh };
}

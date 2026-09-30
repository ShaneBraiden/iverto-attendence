/**
 * Stand-in for a network query while a product has no backend yet.
 *
 * Returns the same `{ data, loading, error, refetch }` shape a real query hook
 * would, and waits a moment before resolving so skeletons and entrance motion
 * are exercised exactly as they will be against a real API. Swapping a screen
 * onto a real backend later means replacing the loader, not the screen.
 */
import { useCallback, useEffect, useState } from 'react';

export function useMock<T>(load: () => T | Promise<T>, deps: unknown[] = [], delayMs = 450) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const value = await load();
        if (alive) setData(value);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoading(false);
      }
    }, delayMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, refetch };
}

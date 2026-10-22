/**
 * A minimal query hook: `{ data, loading, error, refetch, setData }`.
 *
 * A refetch keeps the data already on screen while it loads, so screens show
 * their skeleton only on the very first load (`loading && !data`). Responses
 * that arrive after a newer request started are dropped, so flipping months
 * quickly can never paint an older month over a newer one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useQuery<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    loader
      .current()
      .then((value) => {
        if (mine === seq.current) setData(value);
      })
      .catch((e) => {
        if (mine === seq.current) setError(e);
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  /* Unmounting invalidates whatever is still in flight. */
  useEffect(
    () => () => {
      seq.current++;
    },
    [],
  );

  const refetch = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, refetch, setData };
}

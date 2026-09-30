/**
 * `useMock` that reloads whenever the screen comes back into focus, so an
 * approval made on one tab shows up on the next without a manual refresh —
 * what a real app gets from refetch-on-focus in its query layer.
 */
import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMock } from '@/lib/useMock';

export function useScreenData<T>(load: () => T | Promise<T>, deps: unknown[] = []) {
  const q = useMock(load, deps);
  const first = useRef(true);
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
  return q;
}

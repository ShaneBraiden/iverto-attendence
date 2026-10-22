/**
 * `useQuery` that reloads whenever the screen comes back into focus, so an
 * approval made on one tab shows up on the next without a manual refresh.
 *
 * It also reloads when the app returns from the background while the screen is
 * focused. Without that, a Today card left open overnight still shows
 * yesterday's punches the next morning — and offers the wrong punch direction.
 */
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@/lib/useQuery';

export function useScreenData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const q = useQuery(load, deps);
  const first = useRef(true);
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      if (first.current) first.current = false;
      else refetch();
      let state = AppState.currentState;
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active' && state !== 'active') refetch();
        state = next;
      });
      return () => sub.remove();
    }, [refetch]),
  );
  return q;
}

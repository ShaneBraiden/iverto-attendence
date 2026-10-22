/**
 * The little the app still works out for itself.
 *
 * The server owns the attendance engine — statuses, lateness, worked minutes
 * and segments all arrive computed. `/mobile/today` sends raw punches without
 * segments, though, so the live timeline pairs them here, and the punch button
 * needs to know whether the next punch is an in or an out.
 */
import type { Punch } from '@/lib/api';
import { dayDate, minutesOf } from '@/lib/format';

export type Direction = 'in' | 'out';

/** `in` / `out`, or null for a two-way gate the server could not place. */
export function directionOf(p: Pick<Punch, 'direction'>): Direction | null {
  const d = (p.direction ?? '').toLowerCase();
  return d === 'in' || d === 'out' ? d : null;
}

export interface Span {
  in: string;
  out: string | null;
}

/**
 * In/out pairing for the timeline. An unplaced punch takes the direction
 * opposite to the current state; repeated INs keep the first, a stray OUT with
 * nothing open is dropped.
 */
export function pairPunches(punches: Punch[]) {
  const sorted = [...punches].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
  const spans: Span[] = [];
  let inside = false;
  for (const p of sorted) {
    const dir = directionOf(p) ?? (inside ? 'out' : 'in');
    if (dir === 'in') {
      if (!inside) spans.push({ in: p.punchedAt, out: null });
      inside = true;
    } else if (inside) {
      spans[spans.length - 1].out = p.punchedAt;
      inside = false;
    }
  }
  return { spans, inside };
}

/** Local instant for a site-time `HH:MM` on a calendar day (device zone ≈ site zone). */
export function atLocal(date: string, time: string | null | undefined): Date | null {
  const mins = minutesOf(time);
  if (mins == null) return null;
  return new Date(dayDate(date).getTime() + mins * 60_000);
}

/** The scheduled window, with a night shift's end rolled into the next day. */
export function shiftWindow(date: string, start: string | null | undefined, end: string | null | undefined) {
  const a = atLocal(date, start);
  let b = atLocal(date, end);
  if (!a || !b) return null;
  if (b.getTime() <= a.getTime()) b = new Date(b.getTime() + 86_400_000);
  return { start: a, end: b };
}

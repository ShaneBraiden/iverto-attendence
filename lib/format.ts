/**
 * Calendar-date and label helpers.
 *
 * Dates on the wire are `YYYY-MM-DD` and are handled as local calendar days.
 * Times arrive two ways — ISO instants (`punchedAt`) and `HH:MM` strings the
 * server already rendered in site time (`local.firstIn`) — and `timeLabel`
 * shows either as "09:05 AM".
 */
import { isoToTime } from '@/lib/datetime';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIsoDay(new Date());

/** "2026-09-30" → local midnight. */
export function dayDate(date: string) {
  const [y, m, d] = (date ?? '').slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date: string, n: number) {
  const d = dayDate(date);
  d.setDate(d.getDate() + n);
  return toIsoDay(d);
}

/** Calendar days from `from` to `to`, both included. */
export function daysBetween(from: string, to: string) {
  return Math.round((dayDate(to).getTime() - dayDate(from).getTime()) / 86_400_000) + 1;
}

/** `2026-03` for `/attendance?month=`. `month` is 0-based. */
export const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`;

/** "Wed, 30 Sep" */
export function shortDay(date: string) {
  const d = dayDate(date);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const monthLabel = (year: number, month: number) => `${MONTHS[month]} ${year}`;
export const weekday = (date: string) => WEEKDAYS[dayDate(date).getDay()];

export function rangeLabel(from: string, to: string) {
  return !to || from === to ? shortDay(from) : `${shortDay(from)} → ${shortDay(to)}`;
}

export function daysLabel(n: number) {
  return `${n} day${n === 1 ? '' : 's'}`;
}

/** "18:05" → 1085. Null for anything that isn't `HH:MM`. */
export function minutesOf(hhmm: string | null | undefined) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 1085 → "06:05 PM" */
export function clock(mins: number) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(m)} ${suffix}`;
}

/** 1085 → "18:05", what goes on the wire. */
export const hhmm = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;

/** "09:05 AM" from an ISO instant or an `HH:MM` site-time string; `—` otherwise. */
export function timeLabel(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback;
  if (value.includes('T')) return isoToTime(value, fallback);
  const mins = minutesOf(value);
  return mins == null ? fallback : clock(mins);
}

/** "09:00 AM – 06:00 PM", or null when either end is missing. */
export function shiftTimes(start: string | null | undefined, end: string | null | undefined) {
  return start && end ? `${timeLabel(start)} – ${timeLabel(end)}` : null;
}

/** "Rahul Sharma" → "RS" */
export function initials(name: string | null | undefined) {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** "WEEKLY_OFF" → "Weekly off" — for server enums with no entry in `STATUS`. */
export function humanize(value: string | null | undefined) {
  if (!value) return 'Unknown';
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

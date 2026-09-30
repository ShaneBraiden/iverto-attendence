/**
 * A pocket version of the attendance engine (ARCHITECTURE §6).
 *
 * `computeDay` is pure: schedule + punches + leave + remote + policy + now in,
 * a day row out. Days are recomputed, never incremented — the mock store calls
 * it every time a screen reads a day, so approving a correction or a leave
 * shows up everywhere at once, exactly as it will against the real API.
 */

export type Direction = 'IN' | 'OUT' | 'UNKNOWN';
export type PunchSource = 'TERMINAL' | 'MOBILE' | 'CORRECTION';

export interface Punch {
  id: string;
  /** ISO instant. */
  at: string;
  direction: Direction;
  source: PunchSource;
  device: string;
  note?: string;
}

export interface Shift {
  code: string;
  name: string;
  /** Minutes after local midnight. `end <= start` means a night shift. */
  start: number;
  end: number;
  breakMin: number;
}

export type DayType = 'WORK' | 'HOLIDAY' | 'WEEKLY_OFF';

export type DayStatus =
  | 'PRESENT'
  | 'HALF_DAY'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'HALF_LEAVE'
  | 'REMOTE'
  | 'HOLIDAY'
  | 'WEEKLY_OFF'
  | 'PENDING';

export type LiveState =
  | 'OFF'
  | 'ON_LEAVE'
  | 'NOT_YET_IN'
  | 'LATE_NOT_IN'
  | 'IN'
  | 'IN_LATE'
  | 'REMOTE'
  | 'ON_BREAK'
  | 'LEFT'
  | 'ABSENT';

export interface Segment {
  in: string;
  out: string | null;
  minutes: number;
}

export const POLICY = {
  graceInMinutes: 10,
  graceOutMinutes: 10,
  halfDayRatio: 0.5,
  fullDayRatio: 0.9,
  duplicatePunchSeconds: 60,
  absentAfterMinutes: 120,
  overtimeMinMinutes: 30,
  /** How long after shift end a day stays open before it is finalised. */
  closeAfterMinutes: 60,
};

const MIN = 60_000;

/** "2026-09-30" → local midnight. */
export function dayStart(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function atMinutes(date: string, minutes: number) {
  return new Date(dayStart(date).getTime() + minutes * MIN);
}

export function shiftWindow(date: string, shift: Shift) {
  const start = atMinutes(date, shift.start);
  const duration = shift.end > shift.start ? shift.end - shift.start : shift.end + 1440 - shift.start;
  const end = new Date(start.getTime() + duration * MIN);
  return { start, end, duration, required: duration - shift.breakMin };
}

/** "09:30 – 18:30" */
export function shiftLabel(shift: Shift) {
  const f = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  return `${f(shift.start)} – ${f(shift.end)}`;
}

/**
 * In/out pairing (§6.4). Drops double-reads, gives `UNKNOWN` punches the
 * direction opposite to the current state, keeps the first of repeated INs and
 * the last of repeated OUTs.
 */
export function pairPunches(punches: Punch[], open: boolean, now: Date) {
  const sorted = [...punches].sort((a, b) => a.at.localeCompare(b.at));
  const kept: Punch[] = [];
  for (const p of sorted) {
    const prev = kept[kept.length - 1];
    if (prev && Date.parse(p.at) - Date.parse(prev.at) < POLICY.duplicatePunchSeconds * 1000) continue;
    kept.push(p);
  }

  const segments: Segment[] = [];
  let inside = false;
  let missedPunch = false;
  let lastWasOut = false;
  for (const p of kept) {
    const dir = p.direction === 'UNKNOWN' ? (inside ? 'OUT' : 'IN') : p.direction;
    if (dir === 'IN') {
      if (!inside) segments.push({ in: p.at, out: null, minutes: 0 });
      inside = true;
      lastWasOut = false;
    } else {
      const last = segments[segments.length - 1];
      if (inside && last) {
        last.out = p.at;
      } else if (lastWasOut && last) {
        last.out = p.at; // four exits in a row → keep the last
      } else {
        missedPunch = true; // leading OUT with no IN
      }
      inside = false;
      lastWasOut = true;
    }
  }

  for (const s of segments) {
    const end = s.out ? Date.parse(s.out) : open ? now.getTime() : Date.parse(s.in);
    s.minutes = Math.max(0, Math.round((end - Date.parse(s.in)) / MIN));
  }
  if (!open && segments.some((s) => !s.out)) missedPunch = true;

  const workedMin = segments.reduce((sum, s) => sum + s.minutes, 0);
  let breakMin = 0;
  for (let i = 1; i < segments.length; i++) {
    const prevOut = segments[i - 1].out;
    if (prevOut) breakMin += Math.round((Date.parse(segments[i].in) - Date.parse(prevOut)) / MIN);
  }
  const closed = segments.filter((s) => s.out);
  return {
    punches: kept,
    segments,
    workedMin,
    breakMin,
    missedPunch,
    inside,
    firstIn: segments[0]?.in ?? null,
    lastOut: closed.length ? closed[closed.length - 1].out : null,
  };
}

export interface ComputeInput {
  date: string;
  dayType: DayType;
  shift: Shift | null;
  punches: Punch[];
  leave: { portion: 1 | 0.5 } | null;
  remote: boolean;
  now: Date;
}

export function computeDay(input: ComputeInput) {
  const { date, dayType, shift, leave, remote, now } = input;
  const win = shift ? shiftWindow(date, shift) : null;
  const open = !!win && now.getTime() < win.end.getTime() + POLICY.closeAfterMinutes * MIN && now >= dayStart(date);
  const paired = pairPunches(input.punches, open, now);
  const required = win?.required ?? 0;
  const worked = paired.workedMin;

  // Flags — measured against the scheduled start/end.
  let lateMin = 0;
  let earlyMin = 0;
  let otMin = 0;
  if (win && paired.firstIn) {
    const late = Math.round((Date.parse(paired.firstIn) - win.start.getTime()) / MIN);
    if (late > POLICY.graceInMinutes) lateMin = late;
  }
  if (win && paired.lastOut && !paired.inside && !open) {
    const early = Math.round((win.end.getTime() - Date.parse(paired.lastOut)) / MIN);
    if (early > POLICY.graceOutMinutes) earlyMin = early;
  }
  if (win && worked - required >= POLICY.overtimeMinMinutes) otMin = worked - required;
  if (dayType !== 'WORK' && worked > 0) otMin = worked;

  // Status (§6.5), first match wins.
  let status: DayStatus;
  if (dayType === 'HOLIDAY') status = 'HOLIDAY';
  else if (dayType === 'WEEKLY_OFF') status = 'WEEKLY_OFF';
  else if (leave?.portion === 1) status = 'ON_LEAVE';
  else if (open) status = 'PENDING';
  else if (leave?.portion === 0.5)
    status = worked >= (required / 2) * POLICY.halfDayRatio ? 'HALF_LEAVE' : 'ABSENT';
  else if (remote && worked >= required * POLICY.halfDayRatio)
    status = worked >= required * POLICY.fullDayRatio ? 'REMOTE' : 'HALF_DAY';
  else if (worked >= required * POLICY.fullDayRatio) status = 'PRESENT';
  else if (worked >= required * POLICY.halfDayRatio) status = 'HALF_DAY';
  else status = 'ABSENT';

  return {
    ...paired,
    open,
    requiredMin: required,
    lateMin,
    earlyMin,
    otMin,
    status,
    liveState: open || isSameDay(date, now) ? liveStateOf(input, paired, lateMin) : null,
  };
}

function isSameDay(date: string, now: Date) {
  return dayStart(date).getTime() === new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** What the live board shows right now (§6.5 live state, §10 sweeper rules). */
function liveStateOf(
  input: ComputeInput,
  paired: ReturnType<typeof pairPunches>,
  lateMin: number,
): LiveState {
  const { date, dayType, shift, leave, remote, now } = input;
  if (dayType !== 'WORK' || !shift) return 'OFF';
  if (leave?.portion === 1) return 'ON_LEAVE';
  const win = shiftWindow(date, shift);
  if (paired.segments.length === 0) {
    if (leave?.portion === 0.5) return 'NOT_YET_IN';
    const since = (now.getTime() - win.start.getTime()) / MIN;
    if (since <= POLICY.graceInMinutes) return 'NOT_YET_IN';
    if (since <= POLICY.absentAfterMinutes) return 'LATE_NOT_IN';
    return 'ABSENT';
  }
  if (paired.inside) return remote ? 'REMOTE' : lateMin ? 'IN_LATE' : 'IN';
  if (leave?.portion === 0.5) return 'LEFT';
  const sinceOut = paired.lastOut ? (now.getTime() - Date.parse(paired.lastOut)) / MIN : Infinity;
  const beforeEnd = (win.end.getTime() - now.getTime()) / MIN;
  return sinceOut < 90 && beforeEnd > 30 ? 'ON_BREAK' : 'LEFT';
}

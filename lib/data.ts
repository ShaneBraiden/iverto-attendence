/**
 * Mock backend for Iverto Attendance.
 *
 * Module-level arrays stand in for Postgres. Raw punches are immutable (D5):
 * approving a correction adds CORRECTION punches rather than editing any, and
 * every day is recomputed through `computeDay` on read (D4). Screens load
 * through `useMock(() => …)`, so swapping in the real `/v1/mobile/*` API later
 * replaces these functions, not the screens.
 */
import {
  computeDay,
  dayStart,
  atMinutes,
  DayStatus,
  DayType,
  LiveState,
  Punch,
  Segment,
  Shift,
} from '@/lib/attendance';

// ─── Org, shifts, devices ──────────────────────────────────────────────────

export const ORG = {
  name: 'Northwind Logistics',
  site: 'Bengaluru HQ · Whitefield',
  timezone: 'Asia/Kolkata (IST, UTC+05:30)',
};

export const SHIFTS: Record<string, Shift> = {
  GEN: { code: 'GEN', name: 'General', start: 9 * 60 + 30, end: 18 * 60 + 30, breakMin: 60 },
  MOR: { code: 'MOR', name: 'Morning', start: 6 * 60, end: 14 * 60, breakMin: 30 },
  EVE: { code: 'EVE', name: 'Evening', start: 14 * 60, end: 22 * 60, breakMin: 30 },
  NGT: { code: 'NGT', name: 'Night', start: 22 * 60, end: 6 * 60, breakMin: 30 },
};

export interface Device {
  id: string;
  name: string;
  gate: 'IN' | 'OUT' | 'BOTH';
  online: boolean;
  lastSeenMin: number;
}

export const DEVICES: Device[] = [
  { id: 'T1', name: 'Main Gate · Entry', gate: 'IN', online: true, lastSeenMin: 0 },
  { id: 'T2', name: 'Main Gate · Exit', gate: 'OUT', online: true, lastSeenMin: 0 },
  { id: 'T3', name: 'Cafeteria', gate: 'BOTH', online: true, lastSeenMin: 1 },
  { id: 'T4', name: 'Warehouse Dock B', gate: 'BOTH', online: false, lastSeenMin: 18 },
];
const deviceName = (id: string) => `${DEVICES.find((d) => d.id === id)?.name ?? id} · M50`;

export const HOLIDAYS: { date: string; name: string }[] = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Holi' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi' },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-09', name: 'Diwali' },
  { date: '2026-12-25', name: 'Christmas' },
  { date: '2027-01-26', name: 'Republic Day' },
  { date: '2027-03-22', name: 'Holi' },
];

// ─── People ────────────────────────────────────────────────────────────────

export type Role = 'employee' | 'manager';
export type MobilePunch = 'NEVER' | 'REMOTE_DAYS' | 'ALWAYS';

export interface Employee {
  id: string;
  name: string;
  code: string;
  designation: string;
  department: string;
  shift: string;
  /** Weekdays off, 0 = Sunday. */
  weeklyOff: number[];
  managerId: string | null;
  email: string;
  phone: string;
  mobilePunch: MobilePunch;
  facesEnrolled: number;
  joined: string;
}

const todayDow = new Date().getDay();

export const EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Aarav Mehta', code: 'NW-0142', designation: 'Senior Operations Associate', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'aarav.mehta@northwind.in', phone: '+91 98450 21734', mobilePunch: 'ALWAYS', facesEnrolled: 4, joined: '2023-06-12' },
  { id: 'm1', name: 'Kavya Iyer', code: 'NW-0031', designation: 'Operations Lead', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: null, email: 'kavya.iyer@northwind.in', phone: '+91 99001 48620', mobilePunch: 'REMOTE_DAYS', facesEnrolled: 4, joined: '2019-02-04' },
  { id: 'e2', name: 'Rohan Deshpande', code: 'NW-0158', designation: 'Dispatch Coordinator', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'rohan.d@northwind.in', phone: '+91 90080 11293', mobilePunch: 'NEVER', facesEnrolled: 4, joined: '2023-09-01' },
  { id: 'e3', name: 'Sneha Kulkarni', code: 'NW-0171', designation: 'Inventory Analyst', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'sneha.k@northwind.in', phone: '+91 97411 60582', mobilePunch: 'NEVER', facesEnrolled: 3, joined: '2024-01-15' },
  { id: 'e4', name: 'Imran Shaikh', code: 'NW-0183', designation: 'Fleet Supervisor', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'imran.s@northwind.in', phone: '+91 96320 77415', mobilePunch: 'NEVER', facesEnrolled: 4, joined: '2024-03-18' },
  { id: 'e5', name: 'Meera Nair', code: 'NW-0190', designation: 'Customer Success Executive', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'meera.n@northwind.in', phone: '+91 98864 30921', mobilePunch: 'NEVER', facesEnrolled: 4, joined: '2024-05-06' },
  { id: 'e6', name: 'Vikram Rao', code: 'NW-0204', designation: 'Route Planner', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'vikram.r@northwind.in', phone: '+91 99452 18067', mobilePunch: 'REMOTE_DAYS', facesEnrolled: 4, joined: '2024-07-22' },
  { id: 'e7', name: 'Ananya Ghosh', code: 'NW-0219', designation: 'Operations Associate', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'ananya.g@northwind.in', phone: '+91 91087 55246', mobilePunch: 'NEVER', facesEnrolled: 2, joined: '2025-01-09' },
  { id: 'e8', name: 'Karthik Subramanian', code: 'NW-0226', designation: 'Night Shift Supervisor', department: 'Warehouse', shift: 'NGT', weeklyOff: [6], managerId: 'm1', email: 'karthik.s@northwind.in', phone: '+91 94480 62318', mobilePunch: 'NEVER', facesEnrolled: 4, joined: '2025-02-17' },
  { id: 'e9', name: 'Pooja Hegde', code: 'NW-0233', designation: 'Billing Executive', department: 'Operations', shift: 'GEN', weeklyOff: [0], managerId: 'm1', email: 'pooja.h@northwind.in', phone: '+91 97390 81450', mobilePunch: 'NEVER', facesEnrolled: 4, joined: '2025-04-01' },
  { id: 'e10', name: 'Arjun Patil', code: 'NW-0241', designation: 'Warehouse Associate', department: 'Warehouse', shift: 'MOR', weeklyOff: [todayDow], managerId: 'm1', email: 'arjun.p@northwind.in', phone: '+91 90361 24785', mobilePunch: 'NEVER', facesEnrolled: 4, joined: '2025-06-23' },
];

export const ME_ID: Record<Role, string> = { employee: 'e1', manager: 'm1' };

export function employee(id: string) {
  const e = EMPLOYEES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown employee ${id}`);
  return e;
}
export const shiftOf = (e: Employee) => SHIFTS[e.shift];
export const teamOf = (managerId: string) => EMPLOYEES.filter((e) => e.managerId === managerId);

// ─── Dates ─────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const toIsoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIsoDay(new Date());
export function addDays(date: string, n: number) {
  const d = dayStart(date);
  d.setDate(d.getDate() + n);
  return toIsoDay(d);
}
export const dayDate = dayStart;

/**
 * The clock the demo runs on. Real time during working hours; outside them it
 * pins to early afternoon so the live board always has a mix of states to show.
 */
export function now() {
  const n = new Date();
  const mins = n.getHours() * 60 + n.getMinutes();
  if (mins >= 10 * 60 + 30 && mins <= 21 * 60) return n;
  return atMinutes(todayIso(), 13 * 60 + 25);
}

export const holidayOn = (date: string) => HOLIDAYS.find((h) => h.date === date);

function dayTypeFor(e: Employee, date: string): DayType {
  if (holidayOn(date) && e.shift !== 'NGT') return 'HOLIDAY';
  if (e.weeklyOff.includes(dayStart(date).getDay())) return 'WEEKLY_OFF';
  return 'WORK';
}

/** The last `n` working days for this employee, most recent first (today excluded). */
export function recentWorkingDays(empId: string, n: number) {
  const e = employee(empId);
  const out: string[] = [];
  let d = addDays(todayIso(), -1);
  while (out.length < n) {
    if (dayTypeFor(e, d) === 'WORK') out.push(d);
    d = addDays(d, -1);
  }
  return out;
}

function nextWorkingDay(empId: string, after: number) {
  const e = employee(empId);
  let d = addDays(todayIso(), after);
  while (dayTypeFor(e, d) !== 'WORK') d = addDays(d, 1);
  return d;
}

// ─── Requests: leave, correction, remote work ──────────────────────────────

export type RequestKind = 'LEAVE' | 'CORRECTION' | 'REMOTE';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveType {
  code: string;
  name: string;
  allowHalf: boolean;
  minNoticeDays: number;
  opening: number;
  hint: string;
}

export const LEAVE_TYPES: LeaveType[] = [
  { code: 'CL', name: 'Casual leave', allowHalf: true, minNoticeDays: 1, opening: 8, hint: 'Half days allowed · 1 day notice' },
  { code: 'SL', name: 'Sick leave', allowHalf: true, minNoticeDays: 0, opening: 6, hint: 'Certificate needed beyond 2 days' },
  { code: 'EL', name: 'Earned leave', allowHalf: false, minNoticeDays: 7, opening: 14.5, hint: 'Full days only · 7 days notice' },
  { code: 'COMP', name: 'Comp-off', allowHalf: true, minNoticeDays: 1, opening: 1, hint: 'Earned by working an off day' },
];
export const leaveType = (code: string) => LEAVE_TYPES.find((t) => t.code === code)!;

export type Half = 'FIRST' | 'SECOND';

export interface Request {
  id: string;
  kind: RequestKind;
  employeeId: string;
  status: RequestStatus;
  reason: string;
  createdAt: string;
  /** LEAVE / REMOTE range, or the CORRECTION date in `from`. */
  from: string;
  to: string;
  days: number;
  leaveType?: string;
  half?: Half | null;
  /** CORRECTION: minutes after midnight. */
  inTime?: number | null;
  outTime?: number | null;
  decidedAt?: string;
  decisionNote?: string;
}

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

// Seed dates are relative to today so the demo always looks current.
const meRecent = recentWorkingDays('e1', 12);
const MISSED_OUT_DAY = meRecent[2];
const ABSENT_DAY = meRecent[6];

let seq = 100;
const nextId = (p: string) => `${p}${++seq}`;

export const REQUESTS: Request[] = [
  { id: 'r1', kind: 'LEAVE', employeeId: 'e1', status: 'APPROVED', leaveType: 'CL', from: meRecent[9], to: meRecent[9], days: 1, half: null, reason: 'Family function in Mysuru', createdAt: ago(24 * 16), decidedAt: ago(24 * 15), decisionNote: 'Enjoy!' },
  { id: 'r2', kind: 'CORRECTION', employeeId: 'e1', status: 'PENDING', from: MISSED_OUT_DAY, to: MISSED_OUT_DAY, days: 0, inTime: null, outTime: 18 * 60 + 42, reason: 'Exit gate was offline, walked out with the dispatch team', createdAt: ago(40) },
  { id: 'r3', kind: 'REMOTE', employeeId: 'e1', status: 'PENDING', from: nextWorkingDay('e1', 4), to: nextWorkingDay('e1', 4), days: 1, reason: 'Vendor audit calls, back-to-back from 8 am', createdAt: ago(5) },
  { id: 'r4', kind: 'LEAVE', employeeId: 'e1', status: 'REJECTED', leaveType: 'EL', from: nextWorkingDay('e1', 15), to: addDays(nextWorkingDay('e1', 15), 2), days: 3, half: null, reason: 'Trip to Coorg', createdAt: ago(24 * 3), decidedAt: ago(24 * 2), decisionNote: 'Quarter-close week — could you take the following week instead?' },
  { id: 'r5', kind: 'LEAVE', employeeId: 'e1', status: 'CANCELLED', leaveType: 'CL', from: nextWorkingDay('e1', 9), to: nextWorkingDay('e1', 9), days: 1, half: null, reason: 'Bank work', createdAt: ago(24 * 6) },

  { id: 'r6', kind: 'LEAVE', employeeId: 'e5', status: 'APPROVED', leaveType: 'SL', from: todayIso(), to: addDays(todayIso(), 1), days: 2, half: null, reason: 'Viral fever, doctor advised rest', createdAt: ago(14), decidedAt: ago(12), decisionNote: 'Get well soon' },
  { id: 'r7', kind: 'LEAVE', employeeId: 'e9', status: 'APPROVED', leaveType: 'CL', from: todayIso(), to: todayIso(), days: 0.5, half: 'SECOND', reason: "Parent–teacher meeting at son's school", createdAt: ago(30), decidedAt: ago(26) },
  { id: 'r8', kind: 'LEAVE', employeeId: 'e2', status: 'PENDING', leaveType: 'EL', from: nextWorkingDay('e2', 6), to: addDays(nextWorkingDay('e2', 6), 2), days: 3, half: null, reason: "Sister's wedding in Pune", createdAt: ago(3) },
  { id: 'r9', kind: 'CORRECTION', employeeId: 'e3', status: 'PENDING', from: recentWorkingDays('e3', 1)[0], to: recentWorkingDays('e3', 1)[0], days: 0, inTime: 9 * 60 + 25, outTime: null, reason: 'Face not recognised at entry — came in through reception with a visitor badge', createdAt: ago(20) },
  { id: 'r10', kind: 'REMOTE', employeeId: 'e6', status: 'PENDING', from: nextWorkingDay('e6', 1), to: addDays(nextWorkingDay('e6', 1), 1), days: 2, reason: 'Route survey in Hosur, will work from the client site', createdAt: ago(7) },
  { id: 'r11', kind: 'LEAVE', employeeId: 'e7', status: 'PENDING', leaveType: 'CL', from: nextWorkingDay('e7', 3), to: nextWorkingDay('e7', 3), days: 0.5, half: 'FIRST', reason: 'Passport verification appointment', createdAt: ago(9) },
  { id: 'r12', kind: 'LEAVE', employeeId: 'e8', status: 'PENDING', leaveType: 'COMP', from: nextWorkingDay('e8', 10), to: nextWorkingDay('e8', 10), days: 1, half: null, reason: 'Comp-off for the Ganesh Chaturthi night shift', createdAt: ago(28) },
  { id: 'r13', kind: 'REMOTE', employeeId: 'e10', status: 'APPROVED', from: recentWorkingDays('e10', 5)[4], to: recentWorkingDays('e10', 5)[4], days: 1, reason: 'Supplier onboarding at Peenya', createdAt: ago(24 * 9), decidedAt: ago(24 * 8) },
];

const covers = (r: Request, date: string) => r.from <= date && date <= r.to;

function approvedLeave(empId: string, date: string) {
  return REQUESTS.find((r) => r.kind === 'LEAVE' && r.employeeId === empId && r.status === 'APPROVED' && covers(r, date));
}

/** Working days in a range, halves at the ends — what the server's leave preview returns. */
export function countDays(empId: string, from: string, to: string, half: Half | null) {
  const e = employee(empId);
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayTypeFor(e, d) === 'WORK') n++;
  if (half && from === to && n === 1) return 0.5;
  return n;
}

export function leaveBalances(empId: string) {
  return LEAVE_TYPES.map((t) => {
    const mine = REQUESTS.filter((r) => r.kind === 'LEAVE' && r.employeeId === empId && r.leaveType === t.code);
    const used = mine.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + r.days, 0);
    const pending = mine.filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.days, 0);
    const balance = t.opening - used;
    return { type: t, balance, pending, available: balance - pending, used };
  });
}

export interface LeavePreview {
  days: number;
  available: number;
  after: number;
  warnings: string[];
}

export function previewLeave(empId: string, code: string, from: string, to: string, half: Half | null): LeavePreview {
  const t = leaveType(code);
  const days = countDays(empId, from, to, half);
  const bal = leaveBalances(empId).find((b) => b.type.code === code)!;
  const warnings: string[] = [];
  const notice = Math.round((dayStart(from).getTime() - dayStart(todayIso()).getTime()) / 86_400_000);
  if (notice < t.minNoticeDays) warnings.push(`${t.name} needs ${t.minNoticeDays} day${t.minNoticeDays > 1 ? 's' : ''} notice.`);
  if (days === 0) warnings.push('No working days in this range.');
  if (days > bal.available) warnings.push(`Only ${bal.available} day${bal.available === 1 ? '' : 's'} available.`);
  if (t.code === 'SL' && days > 2) warnings.push('Attach a medical certificate from HR desk within 3 days.');
  const clash = REQUESTS.find(
    (r) => r.employeeId === empId && r.kind === 'LEAVE' && (r.status === 'PENDING' || r.status === 'APPROVED') && r.from <= to && from <= r.to,
  );
  if (clash) warnings.push(`Overlaps an existing ${clash.status.toLowerCase()} request.`);
  return { days, available: bal.available, after: bal.available - days, warnings };
}

export function hasBlockingIssue(p: LeavePreview) {
  return p.days === 0 || p.after < 0 || p.warnings.some((w) => w.startsWith('Overlaps'));
}

// ─── Notifications ─────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  to: string;
  icon: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  href?: string;
}

export const NOTIFICATIONS: Notification[] = [
  { id: 'n1', to: 'e1', icon: 'close-circle-outline', title: 'Earned leave not approved', body: 'Kavya: Quarter-close week — could you take the following week instead?', at: ago(24 * 2), read: false, href: '/request/r4' },
  { id: 'n2', to: 'e1', icon: 'calendar-outline', title: 'Roster updated', body: 'Your Saturday shifts this month moved to General (09:30 – 18:30).', at: ago(24 * 4), read: false },
  { id: 'n3', to: 'e1', icon: 'checkmark-circle-outline', title: 'Casual leave approved', body: 'Kavya approved your leave. Enjoy!', at: ago(24 * 15), read: true, href: '/request/r1' },
  { id: 'n4', to: 'm1', icon: 'document-text-outline', title: 'New leave request', body: 'Rohan Deshpande applied for 3 days of earned leave.', at: ago(3), read: false, href: '/request/r8' },
  { id: 'n5', to: 'm1', icon: 'hardware-chip-outline', title: 'Terminal offline', body: 'Warehouse Dock B M50 stopped responding 18 min ago. Punches will backfill when it reconnects.', at: ago(0.3), read: false },
  { id: 'n6', to: 'm1', icon: 'bar-chart-outline', title: 'Weekly muster roll ready', body: 'Operations · last week · PDF, 11 employees.', at: ago(24 * 2), read: true },
];

function notify(to: string, icon: string, title: string, body: string, href?: string) {
  NOTIFICATIONS.unshift({ id: nextId('n'), to, icon, title, body, at: new Date().toISOString(), read: false, href });
}

export const notificationsFor = (empId: string) => NOTIFICATIONS.filter((n) => n.to === empId);
export const unreadCount = (empId: string) => notificationsFor(empId).filter((n) => !n.read).length;
export function markAllRead(empId: string) {
  NOTIFICATIONS.forEach((n) => {
    if (n.to === empId) n.read = true;
  });
}

// ─── Punches ───────────────────────────────────────────────────────────────

/** Deterministic 0..1 from a string, so a month looks the same on every open. */
function rand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const punch = (date: string, mins: number, direction: Punch['direction'], device: string, source: Punch['source'] = 'TERMINAL'): Punch => ({
  id: `${date}-${mins}-${device}-${direction}`,
  at: atMinutes(date, mins).toISOString(),
  direction,
  source,
  device: source === 'MOBILE' ? 'Iverto app · GPS' : deviceName(device),
});

/** Today, scripted per person so the live board has one of every state. */
const TODAY_SCRIPT: Record<string, [number, 'IN' | 'OUT' | 'UNKNOWN', string][]> = {
  e1: [[576, 'IN', 'T1'], [790, 'UNKNOWN', 'T3'], [833, 'UNKNOWN', 'T3']],
  m1: [[561, 'IN', 'T1'], [781, 'UNKNOWN', 'T3'], [818, 'UNKNOWN', 'T3']],
  e2: [[561, 'IN', 'T1'], [775, 'UNKNOWN', 'T3'], [810, 'UNKNOWN', 'T3']],
  e3: [[608, 'IN', 'T1']],
  e4: [],
  e5: [],
  e6: [[580, 'IN', 'GPS']],
  e7: [[566, 'IN', 'T1'], [785, 'UNKNOWN', 'T3'], [842, 'UNKNOWN', 'T3']],
  e8: [],
  e9: [[563, 'IN', 'T1'], [845, 'OUT', 'T2']],
  e10: [],
};

const REMOTE_TODAY = new Set(['e6']);

/** Mobile punches made in this session (field / remote check-in). */
const MOBILE_PUNCHES: Record<string, Punch[]> = {};

const baseCache = new Map<string, { punches: Punch[]; remote: boolean }>();

function basePunches(e: Employee, date: string): { punches: Punch[]; remote: boolean } {
  const key = `${e.id}|${date}`;
  const hit = baseCache.get(key);
  if (hit) return hit;

  let result: { punches: Punch[]; remote: boolean };
  const shift = shiftOf(e);
  if (date === todayIso()) {
    const cutoff = now().getTime();
    const remote = REMOTE_TODAY.has(e.id);
    const punches = (TODAY_SCRIPT[e.id] ?? [])
      .map(([m, dir, dev]) => punch(date, m, dir, dev, dev === 'GPS' ? 'MOBILE' : 'TERMINAL'))
      .filter((p) => Date.parse(p.at) <= cutoff);
    result = { punches, remote };
    // Today depends on the clock, so it is never cached.
    return result;
  }

  const r = rand(key);
  const r2 = rand(key + 'late');
  const r3 = rand(key + 'out');
  const start = shift.start;
  const end = shift.end > shift.start ? shift.end : shift.end + 1440;
  const inAt = r2 < 0.18 ? start + 12 + Math.round(r2 * 180) : start - 18 + Math.round(r2 * 24);
  const lunch = start + 220 + Math.round(r3 * 40);
  const outAt = r3 < 0.08 ? end - 45 : end + Math.round(r3 * 50) - 3;

  if (dayTypeFor(e, date) !== 'WORK' || approvedLeave(e.id, date)?.half === null) {
    result = { punches: [], remote: false };
  } else if ((e.id === 'e1' && date === ABSENT_DAY) || (e.id !== 'e1' && r < 0.04)) {
    result = { punches: [], remote: false };
  } else if (e.id === 'e1' && date === MISSED_OUT_DAY) {
    result = { punches: [punch(date, inAt, 'IN', 'T1'), punch(date, lunch, 'UNKNOWN', 'T3'), punch(date, lunch + 38, 'UNKNOWN', 'T3')], remote: false };
  } else if (r < 0.09) {
    result = { punches: [punch(date, inAt, 'IN', 'T1'), punch(date, start + 280, 'OUT', 'T2')], remote: false };
  } else if (r < 0.15 || REQUESTS.some((q) => q.kind === 'REMOTE' && q.status === 'APPROVED' && q.employeeId === e.id && covers(q, date))) {
    result = { punches: [punch(date, inAt, 'IN', 'GPS', 'MOBILE'), punch(date, outAt, 'OUT', 'GPS', 'MOBILE')], remote: true };
  } else {
    const ps = [punch(date, inAt, 'IN', e.shift === 'GEN' ? 'T1' : 'T4')];
    if (r3 > 0.25 && e.shift === 'GEN') ps.push(punch(date, lunch, 'UNKNOWN', 'T3'), punch(date, lunch + 32 + Math.round(r * 30), 'UNKNOWN', 'T3'));
    if (r < 0.95) ps.push(punch(date, outAt, 'OUT', e.shift === 'GEN' ? 'T2' : 'T4'));
    result = { punches: ps, remote: false };
  }
  baseCache.set(key, result);
  return result;
}

function correctionPunches(empId: string, date: string): Punch[] {
  return REQUESTS.filter((r) => r.kind === 'CORRECTION' && r.status === 'APPROVED' && r.employeeId === empId && r.from === date).flatMap((r) => {
    const ps: Punch[] = [];
    if (r.inTime != null) ps.push({ ...punch(date, r.inTime, 'IN', 'CORR', 'CORRECTION'), device: 'Approved correction', note: r.reason });
    if (r.outTime != null) ps.push({ ...punch(date, r.outTime, 'OUT', 'CORR', 'CORRECTION'), device: 'Approved correction', note: r.reason });
    return ps;
  });
}

// ─── Day views ─────────────────────────────────────────────────────────────

export interface DayView {
  date: string;
  employeeId: string;
  isToday: boolean;
  future: boolean;
  dayType: DayType;
  holidayName?: string;
  shift: Shift | null;
  status: DayStatus;
  liveState: LiveState | null;
  punches: Punch[];
  segments: Segment[];
  firstIn: string | null;
  lastOut: string | null;
  workedMin: number;
  breakMin: number;
  requiredMin: number;
  lateMin: number;
  earlyMin: number;
  otMin: number;
  missedPunch: boolean;
  corrected: boolean;
  remote: boolean;
  leave: { code: string; half: Half | null } | null;
  requests: Request[];
}

export function dayFor(empId: string, date: string): DayView {
  const e = employee(empId);
  const today = todayIso();
  const dayType = dayTypeFor(e, date);
  const shift = dayType === 'WORK' ? shiftOf(e) : null;
  const leaveReq = approvedLeave(empId, date);
  const future = date > today;
  const base = future ? { punches: [], remote: false } : basePunches(e, date);
  const corrections = future ? [] : correctionPunches(empId, date);
  const mobile = date === today ? MOBILE_PUNCHES[empId] ?? [] : [];
  const remote =
    base.remote ||
    REQUESTS.some((r) => r.kind === 'REMOTE' && r.status === 'APPROVED' && r.employeeId === empId && covers(r, date));

  const result = computeDay({
    date,
    dayType,
    shift,
    punches: [...base.punches, ...mobile, ...corrections],
    leave: leaveReq ? { portion: leaveReq.half ? 0.5 : 1 } : null,
    remote,
    now: now(),
  });

  return {
    date,
    employeeId: empId,
    isToday: date === today,
    future,
    dayType,
    holidayName: holidayOn(date)?.name,
    shift,
    status: result.status,
    liveState: result.liveState,
    punches: result.punches,
    segments: result.segments,
    firstIn: result.firstIn,
    lastOut: result.lastOut,
    workedMin: result.workedMin,
    breakMin: result.breakMin,
    requiredMin: result.requiredMin,
    lateMin: result.lateMin,
    earlyMin: result.earlyMin,
    otMin: result.otMin,
    missedPunch: result.missedPunch,
    corrected: corrections.length > 0,
    remote,
    leave: leaveReq ? { code: leaveReq.leaveType ?? 'CL', half: leaveReq.half ?? null } : null,
    requests: REQUESTS.filter((r) => r.employeeId === empId && covers(r, date)),
  };
}

/** Field / remote punch from the phone (§9). Server time is authoritative. */
export function mobilePunch(empId: string) {
  const day = dayFor(empId, todayIso());
  const last = day.punches[day.punches.length - 1];
  const at = new Date(Math.max(now().getTime(), last ? Date.parse(last.at) + 61_000 : 0));
  const direction = day.segments.some((s) => !s.out) ? 'OUT' : 'IN';
  const p: Punch = {
    id: nextId('p'),
    at: at.toISOString(),
    direction,
    source: 'MOBILE',
    device: 'Iverto app · GPS ±12 m',
  };
  (MOBILE_PUNCHES[empId] ??= []).push(p);
  return p;
}

export function canMobilePunch(empId: string, day: DayView) {
  const e = employee(empId);
  if (day.dayType !== 'WORK' || day.leave?.half === null) return false;
  if (e.mobilePunch === 'ALWAYS') return true;
  return e.mobilePunch === 'REMOTE_DAYS' && day.remote;
}

// ─── Month / schedule ──────────────────────────────────────────────────────

export function monthDays(empId: string, year: number, month: number) {
  const days: DayView[] = [];
  const count = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= count; d++) days.push(dayFor(empId, toIsoDay(new Date(year, month, d))));
  return days;
}

export function monthSummary(days: DayView[]) {
  const past = days.filter((d) => !d.future);
  const count = (s: DayStatus) => past.filter((d) => d.status === s).length;
  return {
    present: count('PRESENT') + count('REMOTE'),
    remote: count('REMOTE'),
    halfDay: count('HALF_DAY'),
    absent: count('ABSENT'),
    leave: count('ON_LEAVE') + count('HALF_LEAVE') * 0.5,
    late: past.filter((d) => d.lateMin > 0).length,
    otMin: past.reduce((s, d) => s + d.otMin, 0),
    workedMin: past.reduce((s, d) => s + d.workedMin, 0),
    missed: past.filter((d) => d.missedPunch && !d.corrected).length,
  };
}

export function schedule(empId: string, days = 14) {
  return Array.from({ length: days }, (_, i) => dayFor(empId, addDays(todayIso(), i)));
}

export function upcomingHolidays() {
  const t = todayIso();
  return HOLIDAYS.filter((h) => h.date >= t);
}

// ─── Manager views ─────────────────────────────────────────────────────────

export const LIVE_GROUPS: { key: string; label: string; states: LiveState[] }[] = [
  { key: 'in', label: 'In', states: ['IN', 'IN_LATE', 'REMOTE', 'ON_BREAK'] },
  { key: 'late', label: 'Late', states: ['IN_LATE', 'LATE_NOT_IN'] },
  { key: 'notin', label: 'Not in', states: ['NOT_YET_IN', 'LATE_NOT_IN'] },
  { key: 'absent', label: 'Absent', states: ['ABSENT'] },
  { key: 'leave', label: 'Leave', states: ['ON_LEAVE'] },
  { key: 'left', label: 'Left', states: ['LEFT'] },
  { key: 'off', label: 'Off', states: ['OFF'] },
];

export function liveBoard(managerId: string) {
  const rows = teamOf(managerId).map((e) => ({ employee: e, day: dayFor(e.id, todayIso()) }));
  const counts = Object.fromEntries(
    LIVE_GROUPS.map((g) => [g.key, rows.filter((r) => r.day.liveState && g.states.includes(r.day.liveState)).length]),
  ) as Record<string, number>;
  const recent = rows
    .flatMap((r) => r.day.punches.map((p) => ({ punch: p, employee: r.employee })))
    .sort((a, b) => b.punch.at.localeCompare(a.punch.at))
    .slice(0, 6);
  return { rows, counts, devices: DEVICES, recent, updatedAt: new Date().toISOString() };
}

export function teamDay(managerId: string, date: string) {
  const rows = teamOf(managerId).map((e) => ({ employee: e, day: dayFor(e.id, date) }));
  const count = (pred: (d: DayView) => boolean) => rows.filter((r) => pred(r.day)).length;
  return {
    rows,
    summary: {
      present: count((d) => ['PRESENT', 'REMOTE', 'HALF_DAY', 'HALF_LEAVE'].includes(d.status) || (d.status === 'PENDING' && d.segments.length > 0)),
      late: count((d) => d.lateMin > 0),
      absent: count((d) => d.status === 'ABSENT' || d.liveState === 'ABSENT'),
      leave: count((d) => d.status === 'ON_LEAVE'),
    },
  };
}

export function requestsFor(empId: string) {
  return REQUESTS.filter((r) => r.employeeId === empId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function approvalsFor(managerId: string) {
  const team = new Set(teamOf(managerId).map((e) => e.id));
  return REQUESTS.filter((r) => team.has(r.employeeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function requestById(id: string) {
  const r = REQUESTS.find((x) => x.id === id);
  if (!r) throw new Error('Request not found');
  return r;
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export function createRequest(input: Omit<Request, 'id' | 'status' | 'createdAt'>) {
  const r: Request = { ...input, id: nextId('r'), status: 'PENDING', createdAt: new Date().toISOString() };
  REQUESTS.unshift(r);
  const e = employee(r.employeeId);
  if (e.managerId) notify(e.managerId, 'document-text-outline', `New ${KIND_LABEL[r.kind].toLowerCase()} request`, `${e.name} · ${requestSummary(r)}`, `/request/${r.id}`);
  return r;
}

export function decide(id: string, decision: 'APPROVED' | 'REJECTED', note: string) {
  const r = requestById(id);
  r.status = decision;
  r.decidedAt = new Date().toISOString();
  r.decisionNote = note.trim() || undefined;
  notify(
    r.employeeId,
    decision === 'APPROVED' ? 'checkmark-circle-outline' : 'close-circle-outline',
    `${KIND_LABEL[r.kind]} ${decision === 'APPROVED' ? 'approved' : 'not approved'}`,
    note.trim() ? `Kavya: ${note.trim()}` : `Kavya ${decision === 'APPROVED' ? 'approved' : 'declined'} your request.`,
    `/request/${r.id}`,
  );
  return r;
}

export function cancelRequest(id: string) {
  const r = requestById(id);
  r.status = 'CANCELLED';
  return r;
}

// ─── Labels ────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<RequestKind, string> = { LEAVE: 'Leave', CORRECTION: 'Correction', REMOTE: 'Remote work' };
export const KIND_ICON: Record<RequestKind, string> = { LEAVE: 'airplane-outline', CORRECTION: 'create-outline', REMOTE: 'home-outline' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Wed, 30 Sep" */
export function shortDay(date: string) {
  const d = dayStart(date);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export const monthLabel = (year: number, month: number) => `${MONTHS[month]} ${year}`;
export const weekday = (date: string) => WEEKDAYS[dayStart(date).getDay()];

export function clock(mins: number) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function rangeLabel(from: string, to: string) {
  return from === to ? shortDay(from) : `${shortDay(from)} → ${shortDay(to)}`;
}

export function requestSummary(r: Request) {
  if (r.kind === 'LEAVE') {
    const half = r.half ? ` · ${r.half === 'FIRST' ? 'first' : 'second'} half` : '';
    return `${leaveType(r.leaveType ?? 'CL').name} · ${rangeLabel(r.from, r.to)}${half}`;
  }
  if (r.kind === 'CORRECTION') {
    const parts = [r.inTime != null && `in ${clock(r.inTime)}`, r.outTime != null && `out ${clock(r.outTime)}`].filter(Boolean);
    return `${shortDay(r.from)} · ${parts.join(', ')}`;
  }
  return `${rangeLabel(r.from, r.to)} · ${r.days} day${r.days === 1 ? '' : 's'}`;
}

export function daysLabel(n: number) {
  return `${n} day${n === 1 ? '' : 's'}`;
}

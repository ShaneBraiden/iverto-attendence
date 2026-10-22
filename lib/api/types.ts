/**
 * Wire types for `/v1/mobile/*`, as documented in `mobile_api.md`.
 *
 * Dates are `YYYY-MM-DD`; instants are ISO 8601 in UTC; fields under `local`
 * are `HH:MM` wall-clock strings already rendered in the site's timezone.
 */

export type Role = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';
export type MobilePunchMode = 'NEVER' | 'REMOTE_DAYS' | 'ALWAYS';

/* ---------------------------------------------------------------- Profile */

export interface Me {
  userId: string;
  email: string;
  displayName: string;
  role: Role | string;
  mustChangePassword: boolean;
  organisation: { id: string; name: string; logoUrl: string | null; primaryColor: string | null } | null;
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    designation: string | null;
    department: { id: string; name: string } | null;
    site: { id: string; name: string; timezone: string } | null;
    manager: { id: string; fullName: string; phone: string | null; email: string | null } | null;
    joinedOn: string | null;
  } | null;
  features: {
    mobilePunch: MobilePunchMode;
    canApprove: boolean;
    teamView: boolean;
    remoteWork: boolean;
    leave: boolean;
  };
}

/* ---------------------------------------------------------- Notifications */

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  data: Record<string, unknown> | null;
}

export interface NotificationPage {
  items: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
}

/* ------------------------------------------------------------- Attendance */

export interface ShiftRef {
  id: string;
  name: string;
  code: string;
  color: string | null;
}

export interface Punch {
  id: string;
  punchedAt: string;
  localTime?: string | null;
  /** `in` / `out`; anything else is a two-way gate the server could not place. */
  direction: string | null;
  source: string;
  deviceName: string | null;
}

export interface Today {
  timezone: string;
  now: string;
  day: {
    id: string;
    workDate: string;
    status: string;
    code: string | null;
    dayType: string;
    shiftName: string | null;
    isLate: boolean;
    workedMinutes: number;
    firstIn: string | null;
    lastOut: string | null;
    local: { firstIn: string | null; lastOut: string | null; schedStart: string | null; schedEnd: string | null };
    shift: ShiftRef | null;
  } | null;
  punches: Punch[];
  nextShift: {
    date: string;
    shift: ShiftRef | null;
    start: string | null;
    end: string | null;
    local: { start: string | null; end: string | null };
  } | null;
  mobilePunch: { mode: MobilePunchMode; allowedNow: boolean };
}

export interface MonthDay {
  date: string;
  dayId: string | null;
  status: string;
  code: string | null;
  dayType: string;
  holidayName: string | null;
  isLate: boolean;
  missedPunch: boolean;
  workedMinutes: number;
  /** `HH:MM`, site time. */
  firstIn: string | null;
  lastOut: string | null;
}

export interface MonthTotals {
  present: number;
  remote: number;
  halfDay: number;
  absent: number;
  leave: number;
  holidays: number;
  weeklyOff: number;
  late: number;
  workedMinutes: number;
  overtimeMinutes: number;
}

export interface Month {
  month: string;
  timezone: string;
  days: MonthDay[];
  totals: MonthTotals;
}

export interface Segment {
  in: string;
  out: string | null;
  credited?: boolean;
  local?: { in: string | null; out: string | null };
}

export interface DayDetail {
  id: string;
  workDate: string;
  status: string;
  code: string | null;
  shiftName: string | null;
  workedMinutes: number;
  segments: Segment[];
  punches: Punch[];
  corrections: Record<string, unknown>[];
}

export interface PunchBody {
  direction: 'in' | 'out';
  lat: number;
  lng: number;
  accuracy: number | null;
  isMockLocation: boolean;
  clientTime: string;
}

export interface PunchResult {
  id: string;
  employeeId: string;
  punchedAt: string;
  direction: string;
  source: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

/* ------------------------------------------------------ Schedule, holidays */

export interface ScheduleDay {
  date: string;
  dayType: string;
  holidayName: string | null;
  shift: ShiftRef | null;
  start: string | null;
  end: string | null;
  local: { start: string | null; end: string | null } | null;
  override: boolean;
}

export interface Schedule {
  timezone: string;
  days: ScheduleDay[];
}

export interface Holidays {
  year: number;
  holidays: { date: string; name: string }[];
}

/* ------------------------------------------------------------------ Leave */

export interface LeaveTypeRef {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  paid?: boolean;
}

export interface LeaveBalance {
  leaveType: LeaveTypeRef;
  allocated: number;
  used: number;
  pending: number;
  available: number;
}

export interface LeaveBalances {
  year: number;
  balances: LeaveBalance[];
}

export interface LeaveType extends LeaveTypeRef {
  allowHalfDay: boolean;
  requiresAttachment: boolean;
  minNoticeDays: number;
  countsOffDays: boolean;
  allowNegative: boolean;
  available: number;
}

export type Half = 'FIRST' | 'SECOND';

/**
 * A half is sent only for a half day (`start_half?` / `end_half?` in §6.4).
 * The server reads a present half as "this end of the range is a half day",
 * so sending `FIRST` / `SECOND` on a full day books it as 0.5.
 */
export interface LeaveRange {
  leaveTypeId: string;
  from: string;
  to: string;
  startHalf?: Half;
  endHalf?: Half;
}

export interface LeavePreview {
  workingDays: number;
  available: number;
  /** Balance once these days are taken; the lowest across leave years. */
  availableAfter: number;
  sufficient: boolean;
  /** The server's verdict — false also covers overlaps and policy rules. */
  canSubmit: boolean;
  errors: string[];
  warnings: string[];
  /** One row per day in the range; `type` is null when the server didn't say why a day is off. */
  breakdown: { date: string; type: string | null; deduction: number }[];
}

export interface Upload {
  key: string;
  size: number;
  contentType: string;
}

/* ------------------------------------------------------------------- Team */

export interface LivePerson {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  liveState: string;
  isLate: boolean;
  firstIn: string | null;
  lastOut: string | null;
  shiftStart: string | null;
}

export interface TeamLive {
  generatedAt: string;
  summary: {
    present: number;
    late: number;
    absent: number;
    notYetIn: number;
    onLeave: number;
    remote: number;
    off: number;
    scheduled: number;
  };
  counts: Record<string, number>;
  people: LivePerson[];
  offlineDevices: { id: string; name: string; gateName: string | null }[];
}

/** One row of `/team/attendance`, normalised — the endpoint's shape is undocumented. */
export interface TeamDayRow {
  employeeId: string;
  fullName: string;
  employeeCode: string | null;
  status: string;
  isLate: boolean;
  missedPunch: boolean;
  workedMinutes: number | null;
  firstIn: string | null;
  lastOut: string | null;
  shiftName: string | null;
}

/* -------------------------------------------------------------- Requests */

export type RequestKind = 'LEAVE' | 'CORRECTION' | 'REMOTE';

/**
 * Leave, correction and remote-work requests in one shape, so lists, cards and
 * the detail screen do not branch on which endpoint a row came from.
 */
export interface Req {
  id: string;
  kind: RequestKind;
  status: string;
  reason: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** `YYYY-MM-DD` — the correction's work date for corrections. */
  from: string;
  to: string;
  days: number | null;
  leaveType: LeaveTypeRef | null;
  startHalf: Half | null;
  endHalf: Half | null;
  /** Correction times — ISO instants or `HH:MM`, whichever the server sent. */
  inAt: string | null;
  outAt: string | null;
  employee: { id: string; fullName: string; employeeCode: string | null } | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

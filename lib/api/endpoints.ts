/**
 * One function per `/v1/mobile/*` route (see `mobile_api.md`).
 *
 * Every response is normalised here before a screen sees it. The live server
 * does not always match the reference — the leave preview arrives in another
 * shape entirely, notifications come under `data` rather than `items` — and a
 * missing array read during render takes the whole app down in a release
 * build. So lists default to `[]`, counts to `0`, enums
 * to a readable fallback, and rows without the field they are keyed on are
 * dropped. A few list routes (§6.5, §7.1, §8.1, §10.2) are documented as
 * "cursor-paginated" without a body, so those are read tolerantly — `items` or
 * `data`, `startDate` or `from` — into the app's own `Req` / `TeamDayRow`.
 */
import { del, get, post } from './http';
import { MAX_UPLOAD_BYTES, UPLOAD_TIMEOUT_MS } from './config';
import { ApiError } from './errors';
import type {
  AppNotification,
  DayDetail,
  Half,
  Holidays,
  LeaveBalances,
  LeavePreview,
  LeaveRange,
  LeaveType,
  LeaveTypeRef,
  LivePerson,
  Me,
  MobilePunchMode,
  Month,
  MonthDay,
  NotificationPage,
  Page,
  Punch,
  PunchBody,
  PunchResult,
  Req,
  RequestKind,
  Schedule,
  ScheduleDay,
  Segment,
  ShiftRef,
  TeamDayRow,
  TeamLive,
  Today,
  Upload,
} from './types';

const M = '/mobile';

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** Numbers, and the numeric strings Postgres `numeric` columns serialise to (`"8.0"`). */
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const num0 = (v: unknown) => num(v) ?? 0;
const bool = (v: unknown) => v === true;
const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null);
/** The object entries of an array; anything else is an empty list. */
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj).filter((o): o is Raw => !!o) : []);
/** `2026-04-10` from either a date or a full instant. */
const day = (v: unknown) => str(v)?.slice(0, 10) ?? null;
const idOf = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** The rows of a paginated (or bare-array) response. */
function rowsOf(res: unknown, keys: string[] = []): Raw[] {
  if (Array.isArray(res)) return list(res);
  const o = obj(res);
  if (!o) return [];
  for (const k of [...keys, 'items', 'data', 'rows', 'people', 'employees', 'results']) {
    if (Array.isArray(o[k])) return list(o[k]);
  }
  return [];
}

const cursorOf = (res: unknown) => str(obj(res)?.nextCursor);

/* ------------------------------------------------------------ Shared rows */

function toShift(v: unknown): ShiftRef | null {
  const s = obj(v);
  if (!s) return null;
  return { id: idOf(s.id), name: str(s.name) ?? 'Shift', code: str(s.code) ?? '', color: str(s.color) };
}

/** Punches are keyed and sorted on `punchedAt`, so a row without one is dropped. */
function toPunches(v: unknown): Punch[] {
  return list(v).flatMap((p) => {
    const punchedAt = str(p.punchedAt);
    if (!punchedAt) return [];
    return [
      {
        id: idOf(p.id) || punchedAt,
        punchedAt,
        localTime: str(p.localTime) ?? str(p.local),
        direction: str(p.direction),
        source: str(p.source) ?? '',
        /* Day detail nests the terminal as `device: { name, gateName }`. */
        deviceName: str(p.deviceName) ?? str(obj(p.device)?.name),
      },
    ];
  });
}

function toLeaveTypeRef(v: unknown, fallbackId: unknown = ''): LeaveTypeRef {
  const t = obj(v) ?? {};
  return {
    id: idOf(t.id) || idOf(fallbackId),
    code: str(t.code) ?? '',
    name: str(t.name) ?? 'Leave',
    color: str(t.color),
    paid: typeof t.paid === 'boolean' ? t.paid : undefined,
  };
}

/* ---------------------------------------------------------------- Profile */

/** Exported so a profile cached by an older build can be read through it too. */
export function toMe(v: unknown): Me {
  const r = obj(v) ?? {};
  const f = obj(r.features) ?? {};
  const org = obj(r.organisation);
  const emp = obj(r.employee);
  const dept = obj(emp?.department);
  const site = obj(emp?.site);
  const mgr = obj(emp?.manager);
  return {
    userId: idOf(r.userId),
    email: str(r.email) ?? '',
    displayName: str(r.displayName) ?? str(emp?.fullName) ?? str(r.email) ?? 'Employee',
    role: str(r.role) ?? 'EMPLOYEE',
    mustChangePassword: bool(r.mustChangePassword),
    organisation: org
      ? { id: idOf(org.id), name: str(org.name) ?? '', logoUrl: str(org.logoUrl), primaryColor: str(org.primaryColor) }
      : null,
    employee: emp
      ? {
          id: idOf(emp.id),
          employeeCode: str(emp.employeeCode) ?? '',
          fullName: str(emp.fullName) ?? str(r.displayName) ?? 'Employee',
          designation: str(emp.designation),
          department: dept ? { id: idOf(dept.id), name: str(dept.name) ?? '' } : null,
          site: site ? { id: idOf(site.id), name: str(site.name) ?? '', timezone: str(site.timezone) ?? '' } : null,
          manager: mgr
            ? { id: idOf(mgr.id), fullName: str(mgr.fullName) ?? 'Your manager', phone: str(mgr.phone), email: str(mgr.email) }
            : null,
          joinedOn: str(emp.joinedOn),
        }
      : null,
    features: {
      mobilePunch: (str(f.mobilePunch) ?? 'NEVER') as MobilePunchMode,
      canApprove: bool(f.canApprove),
      teamView: bool(f.teamView),
      remoteWork: bool(f.remoteWork),
      /* Leave is on unless the server says otherwise. */
      leave: f.leave !== false,
    },
  };
}

export const getMe = async () => toMe(await get<unknown>(`${M}/me`));

export const changePassword = (currentPassword: string, newPassword: string) =>
  post<{ status: string; message: string }>(`${M}/password`, { currentPassword, newPassword });

/* ----------------------------------------------------------- Push devices */

/** The device's raw FCM registration token (§3.1) — the server sends with `firebase-admin`. */
export const registerPushDevice = (token: string, platform: 'android' | 'ios') =>
  post<{ status: string }>(`${M}/push-devices`, { token, platform });

/** §3.2. Sign-out waits on this, so it takes a shorter timeout than the default. */
export const unregisterPushDevice = (token: string, timeoutMs?: number) =>
  del<unknown>(`${M}/push-devices/${encodeURIComponent(token)}`, { timeoutMs });

/* ---------------------------------------------------------- Notifications */

export async function getNotifications(cursor?: string | null, limit = 30): Promise<NotificationPage> {
  const res = await get<unknown>(`${M}/notifications`, { cursor, limit });
  const items = rowsOf(res).flatMap((n): AppNotification[] => {
    const id = idOf(n.id);
    if (!id) return [];
    return [
      {
        id,
        type: str(n.type) ?? '',
        title: str(n.title) ?? 'Notification',
        body: str(n.body) ?? '',
        readAt: str(n.readAt),
        createdAt: str(n.createdAt) ?? '',
        data: obj(n.data),
      },
    ];
  });
  return { items, unreadCount: num0(obj(res)?.unreadCount), nextCursor: cursorOf(res) };
}

export const markNotificationsRead = (ids: string[] | 'all') =>
  post<{ updated: number }>(`${M}/notifications/read`, ids === 'all' ? { all: true } : { ids });

/* ------------------------------------------------------------- Attendance */

export async function getToday(): Promise<Today> {
  const r = obj(await get<unknown>(`${M}/today`)) ?? {};
  const d = obj(r.day);
  const workDate = day(d?.workDate);
  const local = obj(d?.local) ?? {};
  const next = obj(r.nextShift);
  const nextDate = day(next?.date);
  const nextLocal = obj(next?.local) ?? {};
  const mp = obj(r.mobilePunch) ?? {};
  return {
    timezone: str(r.timezone) ?? '',
    now: str(r.now) ?? new Date().toISOString(),
    day:
      d && workDate
        ? {
            id: idOf(d.id),
            workDate,
            status: str(d.status) ?? 'UNKNOWN',
            code: str(d.code),
            dayType: str(d.dayType) ?? '',
            shiftName: str(d.shiftName),
            isLate: bool(d.isLate),
            workedMinutes: num0(d.workedMinutes),
            firstIn: str(d.firstIn),
            lastOut: str(d.lastOut),
            local: {
              firstIn: str(local.firstIn),
              lastOut: str(local.lastOut),
              schedStart: str(local.schedStart),
              schedEnd: str(local.schedEnd),
            },
            shift: toShift(d.shift),
          }
        : null,
    punches: toPunches(r.punches),
    nextShift:
      next && nextDate
        ? {
            date: nextDate,
            shift: toShift(next.shift),
            start: str(next.start),
            end: str(next.end),
            local: { start: str(nextLocal.start), end: str(nextLocal.end) },
          }
        : null,
    mobilePunch: { mode: (str(mp.mode) ?? 'NEVER') as MobilePunchMode, allowedNow: bool(mp.allowedNow) },
  };
}

/** `month` is `YYYY-MM`. */
export async function getMonth(month: string): Promise<Month> {
  const r = obj(await get<unknown>(`${M}/attendance`, { month })) ?? {};
  const t = obj(r.totals) ?? {};
  const days = list(r.days)
    .flatMap((d): MonthDay[] => {
      const date = day(d.date);
      if (!date) return [];
      return [
        {
          date,
          dayId: str(d.dayId) ?? str(d.id),
          status: str(d.status) ?? 'UNKNOWN',
          code: str(d.code),
          dayType: str(d.dayType) ?? '',
          holidayName: str(d.holidayName),
          isLate: bool(d.isLate),
          missedPunch: bool(d.missedPunch),
          workedMinutes: num0(d.workedMinutes),
          firstIn: str(d.firstIn),
          lastOut: str(d.lastOut),
        },
      ];
    })
    /* The calendar lays the grid out from the first day onwards. */
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    month: str(r.month) ?? month,
    timezone: str(r.timezone) ?? '',
    days,
    totals: {
      present: num0(t.present),
      remote: num0(t.remote),
      halfDay: num0(t.halfDay),
      absent: num0(t.absent),
      leave: num0(t.leave),
      holidays: num0(t.holidays),
      weeklyOff: num0(t.weeklyOff),
      late: num0(t.late),
      workedMinutes: num0(t.workedMinutes),
      overtimeMinutes: num0(t.overtimeMinutes),
    },
  };
}

export async function getDay(date: string): Promise<DayDetail> {
  const r = obj(await get<unknown>(`${M}/attendance/${date}`)) ?? {};
  const segments = list(r.segments).flatMap((s): Segment[] => {
    const at = str(s.in);
    if (!at) return [];
    const local = obj(s.local);
    return [
      {
        in: at,
        out: str(s.out),
        credited: bool(s.credited),
        local: local ? { in: str(local.in), out: str(local.out) } : undefined,
      },
    ];
  });
  return {
    id: idOf(r.id),
    workDate: day(r.workDate) ?? date,
    status: str(r.status) ?? 'UNKNOWN',
    code: str(r.code),
    shiftName: str(r.shiftName),
    workedMinutes: num0(r.workedMinutes),
    segments,
    punches: toPunches(r.punches),
    corrections: list(r.corrections),
  };
}

export const createPunch = (body: PunchBody, idempotencyKey: string) =>
  post<PunchResult>(`${M}/punches`, body, { idempotencyKey });

/* ------------------------------------------------------ Schedule, holidays */

export async function getSchedule(from?: string, to?: string): Promise<Schedule> {
  const r = obj(await get<unknown>(`${M}/schedule`, { from, to })) ?? {};
  const days = list(r.days).flatMap((d): ScheduleDay[] => {
    const date = day(d.date);
    if (!date) return [];
    const local = obj(d.local);
    return [
      {
        date,
        dayType: str(d.dayType) ?? 'UNKNOWN',
        holidayName: str(d.holidayName),
        shift: toShift(d.shift),
        start: str(d.start),
        end: str(d.end),
        local: local ? { start: str(local.start), end: str(local.end) } : null,
        override: bool(d.override),
      },
    ];
  });
  return { timezone: str(r.timezone) ?? '', days };
}

export async function getHolidays(year: number): Promise<Holidays> {
  const r = await get<unknown>(`${M}/holidays`, { year });
  const holidays = rowsOf(r, ['holidays']).flatMap((h) => {
    const date = day(h.date);
    return date ? [{ date, name: str(h.name) ?? 'Holiday' }] : [];
  });
  return { year: num(obj(r)?.year) ?? year, holidays };
}

/* ------------------------------------------------------------------ Leave */

export async function getLeaveBalances(year?: number): Promise<LeaveBalances> {
  const r = await get<unknown>(`${M}/leave/balances`, { year });
  const balances = rowsOf(r, ['balances']).map((b, i) => {
    const used = num0(b.used);
    /* The live server sends a ledger (`opening`, `accrued`, `balance`, …)
       rather than `allocated`; the year's entitlement is what is left plus
       what has been used. */
    const balance = num(b.balance);
    const allocated = num(b.allocated) ?? (balance != null ? balance + used : num0(b.available) + num0(b.pending) + used);
    return {
      leaveType: toLeaveTypeRef(b.leaveType, b.leaveTypeId ?? i),
      allocated,
      used,
      pending: num0(b.pending),
      available: num0(b.available),
    };
  });
  return { year: num(obj(r)?.year) ?? year ?? new Date().getFullYear(), balances };
}

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const rows = rowsOf(await get<unknown>(`${M}/leave/types`), ['types', 'leaveTypes']);
  return rows.flatMap((t): LeaveType[] => {
    const ref = toLeaveTypeRef(t);
    if (!ref.id) return [];
    return [
      {
        ...ref,
        allowHalfDay: bool(t.allowHalfDay),
        requiresAttachment: bool(t.requiresAttachment),
        minNoticeDays: num0(t.minNoticeDays),
        countsOffDays: bool(t.countsOffDays),
        allowNegative: bool(t.allowNegative),
        available: num0(t.available),
      },
    ];
  });
}

/** `INSUFFICIENT_BALANCE_2026` — the form already explains these through `sufficient`. */
const BALANCE_CODE = /^INSUFFICIENT_BALANCE/;
const CODE_LIKE = /^[A-Z0-9_]+$/;

/** `["…"]` or `[{ code, message }]` → sentences. The live server sends bare codes. */
function messagesOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((m) => {
    const o = obj(m);
    const text = str(o?.message) ?? str(m) ?? str(o?.code);
    if (!text || BALANCE_CODE.test(text) || BALANCE_CODE.test(str(o?.code) ?? '')) return [];
    if (!CODE_LIKE.test(text)) return [text];
    const words = text.replace(/_/g, ' ').toLowerCase();
    return [words.charAt(0).toUpperCase() + words.slice(1)];
  });
}

const hasBalanceCode = (v: unknown) =>
  Array.isArray(v) && v.some((m) => BALANCE_CODE.test(str(m) ?? str(obj(m)?.code) ?? ''));

const nextIsoDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * The deduction preview. The live server answers in a different shape from
 * the reference — `days`, `perDay: [{ date, portion }]` and one `balances` row
 * per leave year, plus `canSubmit` / `errors` / `warnings` — where §6.3
 * documents `workingDays`, `available`, `sufficient` and `breakdown`. Both are
 * read, so the form keeps working whichever one a deployment sends.
 */
export async function previewLeave(range: LeaveRange): Promise<LeavePreview> {
  const r = obj(await post<unknown>(`${M}/leave/requests/preview`, range)) ?? {};
  const balances = list(r.balances);

  let breakdown: LeavePreview['breakdown'] = list(r.breakdown).flatMap((b) => {
    const date = day(b.date);
    return date ? [{ date, type: str(b.type) ?? str(b.dayType), deduction: num0(b.deduction) }] : [];
  });
  if (!breakdown.length && Array.isArray(r.perDay)) {
    /* `perDay` may list only the days that count; every other day in the range is off. */
    const portions = new Map(list(r.perDay).map((p) => [day(p.date), num0(p.portion ?? p.deduction)]));
    breakdown = [];
    for (let d = range.from, i = 0; d <= range.to && i < 366; d = nextIsoDay(d), i++) {
      breakdown.push({ date: d, type: null, deduction: portions.get(d) ?? 0 });
    }
  }

  const workingDays =
    num(r.workingDays) ?? num(r.days) ?? num(r.daysCount) ?? breakdown.reduce((sum, b) => sum + b.deduction, 0);
  const available = num(r.available) ?? num(balances[0]?.available) ?? 0;
  const availableAfter =
    num(r.availableAfter) ??
    (balances.length
      ? Math.min(...balances.map((b) => num(b.availableAfter) ?? num0(b.available) - num0(b.requested)))
      : available - workingDays);
  return {
    workingDays,
    available,
    availableAfter,
    sufficient:
      typeof r.sufficient === 'boolean' ? r.sufficient : availableAfter >= 0 && !hasBalanceCode(r.errors),
    canSubmit: typeof r.canSubmit === 'boolean' ? r.canSubmit : true,
    errors: messagesOf(r.errors),
    warnings: messagesOf(r.warnings),
    breakdown,
  };
}

export async function applyLeave(
  body: LeaveRange & { reason: string; attachmentKey: string | null },
  idempotencyKey: string,
) {
  const res = await post<Raw>(`${M}/leave/requests`, body, { idempotencyKey });
  return remember(toReq('LEAVE', { ...body, ...res }));
}

export async function cancelLeave(id: string, note: string, idempotencyKey: string) {
  const res = await post<Raw | null>(`${M}/leave/requests/${encodeURIComponent(id)}/cancel`, { note }, { idempotencyKey });
  return patchCached('LEAVE', id, { status: str(res?.status) ?? 'CANCELLED' });
}

/* ----------------------------------------------------- Corrections, remote */

export async function applyCorrection(
  body: { date: string; in?: string; out?: string; reason: string },
  idempotencyKey: string,
) {
  const res = await post<Raw>(`${M}/corrections`, body, { idempotencyKey });
  return remember(toReq('CORRECTION', { ...body, ...res }));
}

export async function applyRemote(body: { from: string; to: string; reason: string }, idempotencyKey: string) {
  const res = await post<Raw>(`${M}/remote-work`, body, { idempotencyKey });
  return remember(toReq('REMOTE', { ...body, ...res }));
}

/* ---------------------------------------------------------------- Uploads */

export async function uploadFile(file: { fileName: string; contentType: string; dataBase64: string; size?: number }) {
  if (file.size && file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError('That file is larger than 5 MB. Pick a smaller one.', 400, 'FILE_TOO_LARGE');
  }
  return post<Upload>(
    `${M}/uploads`,
    { fileName: file.fileName, contentType: file.contentType, dataBase64: file.dataBase64 },
    { timeoutMs: UPLOAD_TIMEOUT_MS },
  );
}

/* -------------------------------------------------------------- Requests */

/** The API's path segment for each kind. */
export const KIND_TYPE: Record<RequestKind, 'leave' | 'correction' | 'remote'> = {
  LEAVE: 'leave',
  CORRECTION: 'correction',
  REMOTE: 'remote',
};

const HALVES = new Set(['FIRST', 'SECOND']);
const half = (v: unknown) => (typeof v === 'string' && HALVES.has(v) ? (v as Half) : null);

/** Any leave / correction / remote row, from any route, into one shape. */
export function toReq(kind: RequestKind, r: Raw): Req {
  const from = day(r.startDate) ?? day(r.from) ?? day(r.workDate) ?? day(r.date) ?? '';
  const emp = obj(r.employee);
  const lt = obj(r.leaveType);
  return {
    id: String(r.id ?? ''),
    kind,
    status: str(r.status) ?? 'PENDING',
    reason: str(r.reason),
    createdAt: str(r.createdAt) ?? str(r.appliedAt) ?? str(r.submittedAt),
    decidedAt: str(r.decidedAt) ?? str(r.approvedAt) ?? str(r.rejectedAt) ?? str(r.updatedAt),
    decisionNote: str(r.decisionNote),
    from,
    to: day(r.endDate) ?? day(r.to) ?? from,
    days: num(r.daysCount) ?? num(r.days),
    leaveType: lt ? { id: String(lt.id ?? ''), code: str(lt.code) ?? '', name: str(lt.name) ?? 'Leave', color: str(lt.color) } : null,
    startHalf: half(r.startHalf),
    endHalf: half(r.endHalf),
    inAt: str(r.inAt) ?? str(r.in),
    outAt: str(r.outAt) ?? str(r.out),
    employee: emp
      ? { id: String(emp.id ?? r.employeeId ?? ''), fullName: str(emp.fullName) ?? 'Employee', employeeCode: str(emp.employeeCode) }
      : null,
  };
}

/**
 * There is no "get one request" route, so every request the app has seen is
 * kept here by `kind:id`. The detail screen reads from it while it re-reads
 * the list, and still has something to show for a request that has just left
 * the approvals queue because it was decided.
 */
const cache = new Map<string, Req>();
const keyOf = (kind: RequestKind, id: string) => `${kind}:${id}`;

function remember(r: Req) {
  const prev = cache.get(keyOf(r.kind, r.id));
  /* A thinner row (a mutation reply) never wipes fields a fuller one had. */
  const merged = prev
    ? (Object.fromEntries(
        Object.entries({ ...prev, ...r }).map(([k, v]) => [k, v ?? (prev as unknown as Raw)[k] ?? null]),
      ) as unknown as Req)
    : r;
  cache.set(keyOf(r.kind, r.id), merged);
  return merged;
}

function patchCached(kind: RequestKind, id: string, patch: Partial<Req>) {
  const prev = cache.get(keyOf(kind, id));
  const next = { ...(prev ?? toReq(kind, { id })), ...patch } as Req;
  cache.set(keyOf(kind, id), next);
  return next;
}

export const cachedRequest = (kind: RequestKind, id: string) => cache.get(keyOf(kind, id)) ?? null;

const MY_PATH: Record<RequestKind, string> = {
  LEAVE: `${M}/leave/requests`,
  CORRECTION: `${M}/corrections`,
  REMOTE: `${M}/remote-work`,
};

/** One page of the caller's own leave / correction / remote history. */
export async function getMyRequests(
  kind: RequestKind,
  opts: { status?: string; cursor?: string | null; limit?: number } = {},
): Promise<Page<Req>> {
  const res = await get<unknown>(MY_PATH[kind], {
    status: kind === 'LEAVE' ? opts.status : undefined,
    cursor: opts.cursor,
    limit: opts.limit ?? 20,
  });
  return { items: rowsOf(res).map((r) => remember(toReq(kind, r))), nextCursor: cursorOf(res) };
}

/**
 * First page of each history, newest first. Pass only the kinds the account's
 * `features` allow — a list the API refuses would fail the whole call.
 */
export async function getAllMyRequests(limit = 20, kinds: RequestKind[] = ['LEAVE', 'CORRECTION', 'REMOTE']) {
  const pages = await Promise.all(kinds.map((k) => getMyRequests(k, { limit })));
  return sortRequests(pages.flatMap((p) => p.items));
}

export function sortRequests(list: Req[]) {
  return [...list].sort((a, b) => (b.createdAt ?? b.from).localeCompare(a.createdAt ?? a.from));
}

/* --------------------------------------------------------------- Approvals */

export async function getApprovals(kind: RequestKind, cursor?: string | null, limit = 30): Promise<Page<Req>> {
  const res = await get<unknown>(`${M}/approvals`, { type: KIND_TYPE[kind], cursor, limit });
  return { items: rowsOf(res).map((r) => remember(toReq(kind, r))), nextCursor: cursorOf(res) };
}

/** First page of every queue. `more` is true when any queue has a further page. */
export async function getAllApprovals(limit = 30) {
  const pages = await Promise.all((['LEAVE', 'CORRECTION', 'REMOTE'] as RequestKind[]).map((k) => getApprovals(k, null, limit)));
  return { items: sortRequests(pages.flatMap((p) => p.items)), more: pages.some((p) => !!p.nextCursor) };
}

export async function decide(
  kind: RequestKind,
  id: string,
  decision: 'approve' | 'reject',
  note: string,
  idempotencyKey: string,
) {
  const res = await post<Raw | null>(
    `${M}/approvals/${KIND_TYPE[kind]}/${id}/${decision}`,
    { note: note.trim() || undefined },
    { idempotencyKey },
  );
  return patchCached(kind, id, {
    status: str(res?.status) ?? (decision === 'approve' ? 'APPROVED' : 'REJECTED'),
    decisionNote: str(res?.decisionNote) ?? (note.trim() || null),
    decidedAt: new Date().toISOString(),
  });
}

/**
 * Finds one request for the detail screen: the caller's own history, or the
 * approvals queue when opened by a manager. Walks a few pages, then falls back
 * to what the app has already seen.
 */
export async function findRequest(kind: RequestKind, id: string, asManager: boolean): Promise<Req> {
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const res: Page<Req> = asManager
      ? await getApprovals(kind, cursor, 50)
      : await getMyRequests(kind, { cursor, limit: 50 });
    const hit = res.items.find((r) => r.id === id);
    if (hit) return hit;
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  const seen = cachedRequest(kind, id);
  if (seen) return seen;
  throw new ApiError('That request no longer exists.', 404, 'NOT_FOUND');
}

/* ------------------------------------------------------------------- Team */

export async function getTeamLive(): Promise<TeamLive> {
  const r = obj(await get<unknown>(`${M}/team/live`)) ?? {};
  const s = obj(r.summary) ?? {};
  const counts = obj(r.counts) ?? {};
  const people = list(r.people).flatMap((p): LivePerson[] => {
    const emp = obj(p.employee);
    const employeeId = idOf(p.employeeId) || idOf(emp?.id) || idOf(p.id);
    if (!employeeId) return [];
    return [
      {
        employeeId,
        fullName: str(p.fullName) ?? str(emp?.fullName) ?? 'Employee',
        employeeCode: str(p.employeeCode) ?? str(emp?.employeeCode) ?? '',
        liveState: str(p.liveState) ?? 'UNKNOWN',
        isLate: bool(p.isLate),
        firstIn: str(p.firstIn),
        lastOut: str(p.lastOut),
        shiftStart: str(p.shiftStart),
      },
    ];
  });
  return {
    generatedAt: str(r.generatedAt) ?? new Date().toISOString(),
    summary: {
      present: num0(s.present),
      late: num0(s.late),
      absent: num0(s.absent),
      notYetIn: num0(s.notYetIn),
      onLeave: num0(s.onLeave),
      remote: num0(s.remote),
      off: num0(s.off),
      scheduled: num0(s.scheduled),
    },
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, num0(v)])),
    people,
    offlineDevices: list(r.offlineDevices).map((d, i) => ({
      id: idOf(d.id) || String(i),
      name: str(d.name) ?? 'A',
      gateName: str(d.gateName),
    })),
  };
}

export async function getTeamAttendance(date: string): Promise<TeamDayRow[]> {
  const res = await get<unknown>(`${M}/team/attendance`, { date });
  return rowsOf(res).map((r) => {
    const emp = obj(r.employee);
    const d = obj(r.day) ?? r;
    const local = obj(d.local);
    return {
      employeeId: String(r.employeeId ?? emp?.id ?? r.id ?? ''),
      fullName: str(r.fullName) ?? str(emp?.fullName) ?? str(r.name) ?? 'Employee',
      employeeCode: str(r.employeeCode) ?? str(emp?.employeeCode),
      status: str(d.status) ?? str(r.liveState) ?? 'UNKNOWN',
      isLate: d.isLate === true,
      missedPunch: d.missedPunch === true,
      workedMinutes: num(d.workedMinutes),
      firstIn: str(local?.firstIn) ?? str(d.firstIn),
      lastOut: str(local?.lastOut) ?? str(d.lastOut),
      shiftName: str(d.shiftName) ?? str(obj(d.shift)?.name),
    };
  });
}

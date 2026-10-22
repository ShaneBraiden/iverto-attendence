/**
 * Labels and rules for leave, correction and remote-work requests.
 */
import type { AppNotification, Me, Req, RequestKind } from '@/lib/api';
import { daysBetween, daysLabel, rangeLabel, shortDay, timeLabel, todayIso } from '@/lib/format';

export const KIND_LABEL: Record<RequestKind, string> = { LEAVE: 'Leave', CORRECTION: 'Correction', REMOTE: 'Remote work' };
export const KIND_ICON: Record<RequestKind, string> = {
  LEAVE: 'airplane-outline',
  CORRECTION: 'create-outline',
  REMOTE: 'home-outline',
};

export const isKind = (v: unknown): v is RequestKind => v === 'LEAVE' || v === 'CORRECTION' || v === 'REMOTE';

/** The request histories this account's `features` switch on. */
export function myRequestKinds(me: Pick<Me, 'features'>): RequestKind[] {
  const kinds: RequestKind[] = [];
  if (me.features?.leave !== false) kinds.push('LEAVE');
  kinds.push('CORRECTION');
  if (me.features?.remoteWork) kinds.push('REMOTE');
  return kinds;
}

export function requestTitle(r: Req) {
  if (r.kind === 'LEAVE') return r.leaveType?.name ?? 'Leave';
  return r.kind === 'CORRECTION' ? 'Punch correction' : 'Work remotely';
}

/** "First half" / "Second half" / "From second half" … or null for full days. */
export function halfLabel(r: Pick<Req, 'from' | 'to' | 'startHalf' | 'endHalf'>) {
  const { startHalf, endHalf } = r;
  if (!startHalf || !endHalf) return null;
  if (r.from === r.to) {
    if (startHalf === 'FIRST' && endHalf === 'FIRST') return 'First half';
    if (startHalf === 'SECOND' && endHalf === 'SECOND') return 'Second half';
    return null;
  }
  const parts = [startHalf === 'SECOND' && 'starts second half', endHalf === 'FIRST' && 'ends first half'].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Day count for the card: the server's `daysCount`, else calendar days for remote work. */
export function requestDays(r: Req) {
  if (r.kind === 'CORRECTION') return null;
  if (r.days != null) return r.days;
  return r.kind === 'REMOTE' && r.from ? daysBetween(r.from, r.to || r.from) : null;
}

export function requestSummary(r: Req) {
  if (r.kind === 'LEAVE') {
    const half = halfLabel(r);
    return `${requestTitle(r)} · ${rangeLabel(r.from, r.to)}${half ? ` · ${half.toLowerCase()}` : ''}`;
  }
  if (r.kind === 'CORRECTION') {
    const parts = [r.inAt && `in ${timeLabel(r.inAt)}`, r.outAt && `out ${timeLabel(r.outAt)}`].filter(Boolean);
    return `${r.from ? shortDay(r.from) : 'Correction'}${parts.length ? ` · ${parts.join(', ')}` : ''}`;
  }
  const n = requestDays(r);
  return `${rangeLabel(r.from, r.to)}${n != null ? ` · ${daysLabel(n)}` : ''}`;
}

/** Only leave can be withdrawn (§6.6): while pending, or once approved if it hasn't started. */
export function canCancel(r: Req) {
  if (r.kind !== 'LEAVE') return false;
  return r.status === 'PENDING' || (r.status === 'APPROVED' && r.from >= todayIso());
}

/** `LEAVE_APPROVED` → `LEAVE`; null for notifications that aren't about a request. */
export function kindOfNotification(type: string | null | undefined): RequestKind | null {
  const t = (type ?? '').toUpperCase();
  if (t.startsWith('LEAVE')) return 'LEAVE';
  if (t.startsWith('CORRECTION') || t.includes('MISSED_PUNCH')) return 'CORRECTION';
  if (t.startsWith('REMOTE')) return 'REMOTE';
  return null;
}

/** Whether a notification is a manager being asked to act, rather than an outcome. */
export function isApprovalPrompt(type: string) {
  return /(REQUESTED|SUBMITTED|PENDING|NEW|APPROVAL)/i.test(type) && !/(APPROVED|REJECTED|CANCELLED)$/i.test(type);
}

/**
 * Where opening a notification goes — an inbox row or a tapped push, which
 * carry the same `type` and `data` — or null if it is informational only.
 */
export function notificationTarget(n: Pick<AppNotification, 'type' | 'data'>, manager: boolean) {
  const kind = kindOfNotification(n.type);
  const id = n.data && typeof n.data.id === 'string' ? n.data.id : null;
  if (kind && id) {
    return `/request/${id}?kind=${kind}${manager && isApprovalPrompt(n.type) ? '&role=manager' : ''}`;
  }
  const date = n.data && typeof n.data.date === 'string' ? n.data.date : null;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return `/day/${date}`;
  return null;
}

/**
 * Status → colour, icon and label.
 *
 * Mapping a domain state onto a colour is domain logic, not a design token, so
 * it lives here rather than in `theme/`. Register every status the product has
 * in `STATUS`; `StatusPill` reads nothing else. Unknown statuses fall back to
 * a neutral pill with the raw value as the label, so a new backend state shows
 * up readable rather than crashing.
 */
import { colors } from '@/theme';

export type StatusTone = 'pending' | 'active' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_STYLE: Record<StatusTone, { fg: string; bg: string }> = {
  pending: { fg: colors.warning, bg: colors.warningBg },
  active: { fg: colors.info, bg: colors.infoBg },
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  neutral: { fg: colors.textMuted, bg: colors.neutralBg },
};

/**
 * Three families share this map: finalised day statuses (§6.5), live states
 * for the board (§10) and request statuses (leave / correction / remote).
 */
export const STATUS: Record<string, { tone: StatusTone; label: string; icon: string }> = {
  // Day status
  PRESENT: { tone: 'success', label: 'Present', icon: 'checkmark-circle-outline' },
  HALF_DAY: { tone: 'warning', label: 'Half day', icon: 'contrast-outline' },
  ABSENT: { tone: 'danger', label: 'Absent', icon: 'close-circle-outline' },
  ON_LEAVE: { tone: 'active', label: 'On leave', icon: 'airplane-outline' },
  HALF_LEAVE: { tone: 'active', label: 'Half leave', icon: 'airplane-outline' },
  REMOTE: { tone: 'active', label: 'Remote', icon: 'home-outline' },
  HOLIDAY: { tone: 'neutral', label: 'Holiday', icon: 'sunny-outline' },
  WEEKLY_OFF: { tone: 'neutral', label: 'Weekly off', icon: 'cafe-outline' },
  // Live state
  OFF: { tone: 'neutral', label: 'Off today', icon: 'cafe-outline' },
  NOT_YET_IN: { tone: 'neutral', label: 'Not yet in', icon: 'hourglass-outline' },
  LATE_NOT_IN: { tone: 'warning', label: 'Late · not in', icon: 'alarm-outline' },
  IN: { tone: 'success', label: 'In', icon: 'log-in-outline' },
  IN_LATE: { tone: 'warning', label: 'In · late', icon: 'log-in-outline' },
  ON_BREAK: { tone: 'pending', label: 'On break', icon: 'cafe-outline' },
  LEFT: { tone: 'neutral', label: 'Left', icon: 'log-out-outline' },
  // Requests (PENDING doubles as "day still open")
  PENDING: { tone: 'pending', label: 'Pending', icon: 'time-outline' },
  APPROVED: { tone: 'success', label: 'Approved', icon: 'checkmark-circle-outline' },
  REJECTED: { tone: 'danger', label: 'Rejected', icon: 'close-circle-outline' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled', icon: 'remove-circle-outline' },
};

/** Muster-roll codes for the calendar cells. */
export const DAY_CODE: Record<string, string> = {
  PRESENT: 'P',
  HALF_DAY: 'HD',
  ABSENT: 'A',
  ON_LEAVE: 'L',
  HALF_LEAVE: '½L',
  REMOTE: 'R',
  HOLIDAY: 'H',
  WEEKLY_OFF: 'WO',
  PENDING: '•',
};

export function statusInfo(status: string) {
  const entry = STATUS[status];
  const tone: StatusTone = entry?.tone ?? 'neutral';
  return {
    tone,
    ...TONE_STYLE[tone],
    icon: entry?.icon ?? 'ellipse-outline',
    label: entry?.label ?? status,
  };
}

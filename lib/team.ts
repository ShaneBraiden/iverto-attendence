/**
 * One-line summaries for team rows, shared by the live board, the daily team
 * list and the team-member screen.
 */
import type { LivePerson, TeamDayRow } from '@/lib/api';
import { formatMinutes } from '@/lib/datetime';
import { timeLabel } from '@/lib/format';

/** "In 09:02 AM · late · out 06:10 PM" for the live board. */
export function liveDetail(p: LivePerson) {
  if (p.firstIn) {
    return `In ${timeLabel(p.firstIn)}${p.isLate ? ' · late' : ''}${p.lastOut ? ` · out ${timeLabel(p.lastOut)}` : ''}`;
  }
  return p.shiftStart ? `Shift starts ${timeLabel(p.shiftStart)}` : 'No shift today';
}

/** "In 09:02 AM · late · out 06:10 PM · 8h 30m" for a day's team list. */
export function dayDetail(r: TeamDayRow) {
  if (r.firstIn) {
    return [
      `In ${timeLabel(r.firstIn)}${r.isLate ? ' · late' : ''}`,
      r.lastOut ? `out ${timeLabel(r.lastOut)}` : null,
      r.workedMinutes ? formatMinutes(r.workedMinutes) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (r.missedPunch) return 'Missed punch';
  return r.shiftName ? `${r.shiftName} shift` : 'No punches';
}

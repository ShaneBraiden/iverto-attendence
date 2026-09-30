/**
 * Attendance-specific building blocks, composed from the shared glass
 * components: the month calendar, the in/out timeline, the punch list and the
 * cards used for requests and team members.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, IconTile, StatusPill } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { DAY_CODE, statusInfo } from '@/lib/status';
import { shiftWindow, Punch } from '@/lib/attendance';
import { isoToTime, formatMinutes } from '@/lib/datetime';
import {
  DayView,
  Employee,
  KIND_ICON,
  KIND_LABEL,
  Request,
  requestSummary,
  daysLabel,
  now,
} from '@/lib/data';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------ Calendar */

const WEEK_HEAD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MonthCalendar({ days, onPress }: { days: DayView[]; onPress: (d: DayView) => void }) {
  const lead = days.length ? new Date(days[0].date + 'T00:00:00').getDay() : 0;
  const cells: (DayView | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.week}>
        {WEEK_HEAD.map((d, i) => (
          <Text key={i} style={[styles.weekHead]}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((w, i) => (
        <View key={i} style={styles.week}>
          {w.map((d, j) => (d ? <CalendarCell key={d.date} day={d} onPress={() => onPress(d)} /> : <View key={j} style={styles.cell} />))}
        </View>
      ))}
    </View>
  );
}

function CalendarCell({ day, onPress }: { day: DayView; onPress: () => void }) {
  const info = statusInfo(day.status);
  const n = Number(day.date.slice(8));
  const muted = day.future;
  return (
    <Pressable
      onPress={onPress}
      disabled={muted && day.dayType === 'WORK'}
      style={[
        styles.cell,
        styles.cellBox,
        !muted && { backgroundColor: info.bg },
        day.isToday && styles.today,
      ]}
    >
      <Text style={[styles.cellNum, muted && { color: colors.textFaint }]}>{n}</Text>
      <Text style={[styles.cellCode, { color: muted ? colors.textFaint : info.fg }]}>
        {muted ? (day.dayType === 'HOLIDAY' ? 'H' : day.dayType === 'WEEKLY_OFF' ? 'WO' : day.leave ? 'L' : '') : DAY_CODE[day.status] ?? ''}
      </Text>
      {(day.lateMin > 0 || (day.missedPunch && !day.corrected)) && !muted ? (
        <View style={[styles.flagDot, { backgroundColor: day.missedPunch && !day.corrected ? colors.danger : colors.warning }]} />
      ) : null}
    </Pressable>
  );
}

export function CalendarLegend() {
  const items: [string, string][] = [
    ['PRESENT', 'Present'],
    ['HALF_DAY', 'Half day'],
    ['ABSENT', 'Absent'],
    ['ON_LEAVE', 'Leave'],
    ['REMOTE', 'Remote'],
    ['WEEKLY_OFF', 'Off / holiday'],
  ];
  return (
    <View style={styles.legend}>
      {items.map(([s, l]) => {
        const info = statusInfo(s);
        return (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: info.fg }]} />
            <Text style={styles.legendText}>{l}</Text>
          </View>
        );
      })}
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: colors.warning, width: 6, height: 6 }]} />
        <Text style={styles.legendText}>Late</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: colors.danger, width: 6, height: 6 }]} />
        <Text style={styles.legendText}>Missed punch</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Timeline */

/**
 * The shift as a bar, with worked segments laid over it. Makes "in at 9:36,
 * lunch, back, still in" readable at a glance.
 */
export function DayTimeline({ day }: { day: DayView }) {
  if (!day.shift) return null;
  const win = shiftWindow(day.date, day.shift);
  const from = win.start.getTime() - 60 * 60_000;
  const to = win.end.getTime() + 60 * 60_000;
  const span = to - from;
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - from) / span) * 100))}%` as const;
  const nowT = now().getTime();

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.track}>
        <View
          style={[
            styles.shiftBand,
            { left: pct(win.start.getTime()), width: `${((win.end.getTime() - win.start.getTime()) / span) * 100}%` },
          ]}
        />
        {day.segments.map((s, i) => {
          const a = Date.parse(s.in);
          const b = s.out ? Date.parse(s.out) : Math.min(nowT, to);
          return (
            <View
              key={i}
              style={[
                styles.segment,
                { left: pct(a), width: `${Math.max(1.5, ((b - a) / span) * 100)}%` },
                !s.out && styles.segmentOpen,
              ]}
            />
          );
        })}
      </View>
      <View style={styles.trackLabels}>
        <Text style={styles.trackLabel}>{isoToTime(win.start.toISOString())}</Text>
        <Text style={styles.trackLabel}>Shift · {day.shift.name}</Text>
        <Text style={styles.trackLabel}>{isoToTime(win.end.toISOString())}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Punches */

const SOURCE_ICON: Record<Punch['source'], IconName> = {
  TERMINAL: 'scan-outline',
  MOBILE: 'phone-portrait-outline',
  CORRECTION: 'create-outline',
};

export function PunchList({ punches }: { punches: Punch[] }) {
  let inside = false;
  return (
    <View style={{ gap: spacing.md }}>
      {punches.map((p) => {
        const dir = p.direction === 'UNKNOWN' ? (inside ? 'OUT' : 'IN') : p.direction;
        inside = dir === 'IN';
        return (
          <View key={p.id} style={styles.punch}>
            <IconTile
              icon={dir === 'IN' ? 'log-in-outline' : 'log-out-outline'}
              tint={dir === 'IN' ? colors.success : colors.textMuted}
              bg={dir === 'IN' ? colors.successBg : colors.neutralBg}
              size={34}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.punchTime}>
                {isoToTime(p.at)} <Text style={styles.punchDir}>· {dir === 'IN' ? 'In' : 'Out'}</Text>
              </Text>
              <View style={styles.punchMeta}>
                <Ionicons name={SOURCE_ICON[p.source]} size={12} color={colors.textFaint} />
                <Text style={styles.punchDevice} numberOfLines={1}>
                  {p.device}
                  {p.direction === 'UNKNOWN' ? ' · two-way gate' : ''}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------ Metrics */

export function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.metricValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

export function DayMetrics({ day }: { day: DayView }) {
  return (
    <View style={styles.metrics}>
      <Metric label="In" value={day.firstIn ? isoToTime(day.firstIn) : '—'} tone={day.lateMin ? colors.warning : undefined} />
      <Metric label="Out" value={day.lastOut && !day.segments.some((s) => !s.out) ? isoToTime(day.lastOut) : '—'} />
      <Metric label="Worked" value={day.workedMin ? formatMinutes(day.workedMin) : '—'} />
    </View>
  );
}

/* ------------------------------------------------------------ Cards */

export function RequestCard({
  request,
  employee,
  onPress,
  footer,
}: {
  request: Request;
  employee?: Employee;
  onPress?: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <Card onPress={onPress}>
      <View style={styles.reqTop}>
        <IconTile icon={KIND_ICON[request.kind] as IconName} />
        <View style={{ flex: 1 }}>
          <Text style={styles.reqTitle} numberOfLines={1}>
            {employee ? employee.name : KIND_LABEL[request.kind]}
          </Text>
          <Text style={styles.reqSub} numberOfLines={2}>
            {employee ? `${KIND_LABEL[request.kind]} · ` : ''}
            {requestSummary(request)}
          </Text>
        </View>
        <StatusPill status={request.status} small />
      </View>
      {request.days > 0 && request.kind !== 'CORRECTION' ? (
        <Text style={styles.reqDays}>{daysLabel(request.days)}</Text>
      ) : null}
      <Text style={styles.reqReason} numberOfLines={2}>
        “{request.reason}”
      </Text>
      {footer}
    </Card>
  );
}

export function MemberRow({
  employee,
  day,
  onPress,
  showLive = true,
}: {
  employee: Employee;
  day: DayView;
  onPress?: () => void;
  showLive?: boolean;
}) {
  const status = showLive && day.liveState ? day.liveState : day.status;
  const detail = day.firstIn
    ? `In ${isoToTime(day.firstIn)}${day.lateMin ? ` · ${day.lateMin}m late` : ''}${
        day.lastOut && !day.segments.some((s) => !s.out) ? ` · out ${isoToTime(day.lastOut)}` : ''
      }`
    : day.shift
      ? `${day.shift.name} shift`
      : day.holidayName ?? 'Off';
  const initials = employee.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <Card onPress={onPress} padded={false}>
      <View style={styles.member}>
        <View style={styles.initials}>
          <Text style={styles.initialsText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName} numberOfLines={1}>
            {employee.name}
          </Text>
          <Text style={styles.memberSub} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <StatusPill status={status} small />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', gap: spacing.xs },
  weekHead: { ...type.caption, color: colors.textFaint, flex: 1, textAlign: 'center' },
  cell: { flex: 1, aspectRatio: 0.9 },
  cellBox: {
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  today: { borderColor: colors.primary },
  cellNum: { ...type.smallMed, color: colors.text },
  cellCode: { ...type.caption, letterSpacing: 0 },
  flagDot: { position: 'absolute', top: 5, right: 5, width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.small, color: colors.textMuted },

  track: { height: 14, borderRadius: radius.pill, backgroundColor: colors.neutralBg, overflow: 'hidden' },
  shiftBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.border },
  segment: { position: 'absolute', top: 3, bottom: 3, borderRadius: radius.pill, backgroundColor: colors.primary },
  segmentOpen: { opacity: 0.55 },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  trackLabel: { ...type.small, color: colors.textFaint },

  punch: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  punchTime: { ...type.bodyMed, color: colors.text },
  punchDir: { ...type.body, color: colors.textMuted },
  punchMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  punchDevice: { ...type.small, color: colors.textMuted, flexShrink: 1 },

  metrics: { flexDirection: 'row', gap: spacing.sm },
  metric: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    gap: 2,
  },
  metricLabel: { ...type.caption, color: colors.textFaint },
  metricValue: { ...type.h3, color: colors.text },

  reqTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reqTitle: { ...type.bodyMed, color: colors.text },
  reqSub: { ...type.small, color: colors.textMuted },
  reqDays: { ...type.caption, color: colors.primary, marginTop: spacing.md },
  reqReason: { ...type.small, color: colors.textMuted, marginTop: spacing.sm },

  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  initials: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: { ...type.smallMed, color: colors.primary },
  memberName: { ...type.bodyMed, color: colors.text },
  memberSub: { ...type.small, color: colors.textMuted },
});

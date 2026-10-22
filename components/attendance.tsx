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
import { directionOf, shiftWindow, Span } from '@/lib/attendance';
import { formatMinutes, isoToTime } from '@/lib/datetime';
import { daysLabel, initials, timeLabel } from '@/lib/format';
import { KIND_ICON, KIND_LABEL, requestDays, requestSummary } from '@/lib/requests';
import type { MonthDay, Punch, Req } from '@/lib/api';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------ Calendar */

const WEEK_HEAD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MonthCalendar({
  days,
  today,
  onPress,
}: {
  days: MonthDay[];
  /** `YYYY-MM-DD`; days after it render muted. */
  today: string;
  onPress: (d: MonthDay) => void;
}) {
  const lead = days.length ? new Date(days[0].date + 'T00:00:00').getDay() : 0;
  const cells: (MonthDay | null)[] = [...Array(lead).fill(null), ...days];
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
          {w.map((d, j) =>
            d ? (
              <CalendarCell key={d.date} day={d} future={d.date > today} isToday={d.date === today} onPress={() => onPress(d)} />
            ) : (
              <View key={j} style={styles.cell} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function CalendarCell({
  day,
  future,
  isToday,
  onPress,
}: {
  day: MonthDay;
  future: boolean;
  isToday: boolean;
  onPress: () => void;
}) {
  const info = statusInfo(day.status);
  const n = Number(day.date.slice(8));
  const code = future
    ? day.dayType === 'HOLIDAY'
      ? 'H'
      : day.dayType === 'WEEKLY_OFF'
        ? 'WO'
        : ''
    : day.code ?? DAY_CODE[day.status] ?? '';
  return (
    <Pressable
      onPress={onPress}
      disabled={future}
      style={[styles.cell, styles.cellBox, !future && { backgroundColor: info.bg }, isToday && styles.today]}
    >
      <Text style={[styles.cellNum, future && { color: colors.textFaint }]}>{n}</Text>
      <Text style={[styles.cellCode, { color: future ? colors.textFaint : info.fg }]}>{code}</Text>
      {(day.isLate || day.missedPunch) && !future ? (
        <View style={[styles.flagDot, { backgroundColor: day.missedPunch ? colors.danger : colors.warning }]} />
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
 * lunch, back, still in" readable at a glance. Without a scheduled window the
 * bar simply spans the segments.
 */
export function DayTimeline({
  date,
  schedStart,
  schedEnd,
  spans,
  label,
}: {
  date: string;
  /** `HH:MM`, site time. */
  schedStart?: string | null;
  schedEnd?: string | null;
  spans: Span[];
  label?: string | null;
}) {
  const win = shiftWindow(date, schedStart, schedEnd);
  const nowT = Date.now();
  const ends = spans.flatMap((s) => [Date.parse(s.in), s.out ? Date.parse(s.out) : nowT]).filter(Number.isFinite);
  if (!win && !ends.length) return null;

  const lo = Math.min(...(win ? [win.start.getTime()] : []), ...ends);
  const hi = Math.max(...(win ? [win.end.getTime()] : []), ...ends);
  const from = lo - 60 * 60_000;
  const to = hi + 60 * 60_000;
  const span = to - from;
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - from) / span) * 100))}%` as const;

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.track}>
        {win ? (
          <View
            style={[
              styles.shiftBand,
              { left: pct(win.start.getTime()), width: `${((win.end.getTime() - win.start.getTime()) / span) * 100}%` },
            ]}
          />
        ) : null}
        {spans.map((s, i) => {
          const a = Date.parse(s.in);
          const b = s.out ? Date.parse(s.out) : Math.min(nowT, to);
          return (
            <View
              key={i}
              style={[styles.segment, { left: pct(a), width: `${Math.max(1.5, ((b - a) / span) * 100)}%` }, !s.out && styles.segmentOpen]}
            />
          );
        })}
      </View>
      <View style={styles.trackLabels}>
        <Text style={styles.trackLabel}>{win ? timeLabel(schedStart) : isoToTime(new Date(lo).toISOString())}</Text>
        {label ? <Text style={styles.trackLabel}>Shift · {label}</Text> : null}
        <Text style={styles.trackLabel}>{win ? timeLabel(schedEnd) : isoToTime(new Date(hi).toISOString())}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Punches */

const SOURCE_ICON: Record<string, IconName> = {
  TERMINAL: 'scan-outline',
  MOBILE: 'phone-portrait-outline',
  CORRECTION: 'create-outline',
};

const SOURCE_LABEL: Record<string, string> = {
  TERMINAL: 'Terminal',
  MOBILE: 'Iverto app · GPS',
  CORRECTION: 'Approved correction',
};

export function PunchList({ punches }: { punches: Punch[] }) {
  let inside = false;
  const sorted = [...punches].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
  return (
    <View style={{ gap: spacing.md }}>
      {sorted.map((p) => {
        const placed = directionOf(p);
        const dir = placed ?? (inside ? 'out' : 'in');
        inside = dir === 'in';
        const source = (p.source ?? '').toUpperCase();
        return (
          <View key={p.id} style={styles.punch}>
            <IconTile
              icon={dir === 'in' ? 'log-in-outline' : 'log-out-outline'}
              tint={dir === 'in' ? colors.success : colors.textMuted}
              bg={dir === 'in' ? colors.successBg : colors.neutralBg}
              size={34}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.punchTime}>
                {isoToTime(p.punchedAt)} <Text style={styles.punchDir}>· {dir === 'in' ? 'In' : 'Out'}</Text>
              </Text>
              <View style={styles.punchMeta}>
                <Ionicons name={SOURCE_ICON[source] ?? 'ellipse-outline'} size={12} color={colors.textFaint} />
                <Text style={styles.punchDevice} numberOfLines={1}>
                  {p.deviceName ?? SOURCE_LABEL[source] ?? p.source}
                  {placed ? '' : ' · two-way gate'}
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

export function DayMetrics({
  firstIn,
  lastOut,
  workedMinutes,
  late,
  inside,
}: {
  /** ISO instants or `HH:MM` site-time strings. */
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number | null;
  late?: boolean;
  /** Still inside — the last "out" is a break, not the end of the day. */
  inside?: boolean;
}) {
  return (
    <View style={styles.metrics}>
      <Metric label="In" value={timeLabel(firstIn)} tone={late ? colors.warning : undefined} />
      <Metric label="Out" value={inside ? '—' : timeLabel(lastOut)} />
      <Metric label="Worked" value={workedMinutes ? formatMinutes(workedMinutes) : '—'} />
    </View>
  );
}

/* ------------------------------------------------------------ Cards */

export function RequestCard({
  request,
  showEmployee,
  onPress,
  footer,
}: {
  request: Req;
  /** Manager views lead with who asked. */
  showEmployee?: boolean;
  onPress?: () => void;
  footer?: React.ReactNode;
}) {
  const who = showEmployee ? request.employee?.fullName ?? 'Team member' : null;
  const days = requestDays(request);
  return (
    <Card onPress={onPress}>
      <View style={styles.reqTop}>
        <IconTile icon={KIND_ICON[request.kind] as IconName} />
        <View style={{ flex: 1 }}>
          <Text style={styles.reqTitle} numberOfLines={1}>
            {who ?? KIND_LABEL[request.kind]}
          </Text>
          <Text style={styles.reqSub} numberOfLines={2}>
            {who ? `${KIND_LABEL[request.kind]} · ` : ''}
            {requestSummary(request)}
          </Text>
        </View>
        <StatusPill status={request.status} small />
      </View>
      {days ? <Text style={styles.reqDays}>{daysLabel(days)}</Text> : null}
      {request.reason ? (
        <Text style={styles.reqReason} numberOfLines={2}>
          “{request.reason}”
        </Text>
      ) : null}
      {footer}
    </Card>
  );
}

export function MemberRow({
  name,
  detail,
  status,
  onPress,
}: {
  name: string;
  detail: string;
  status: string;
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress} padded={false}>
      <View style={styles.member}>
        <View style={styles.initials}>
          <Text style={styles.initialsText}>{initials(name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName} numberOfLines={1}>
            {name}
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

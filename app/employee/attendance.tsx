/**
 * Employee · Attendance — the month as a muster-roll calendar, totals, and the
 * days that need attention (late, missed punch, absent).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Card, EmptyState, ErrorState, SectionHeader, StatusPill } from '@/components/ui';
import { SkeletonCard, SkeletonDetailRows, SkeletonList } from '@/components/Skeleton';
import { CalendarLegend, Metric, MonthCalendar } from '@/components/attendance';
import { colors, radius, spacing, type } from '@/theme';
import { getMonth, MonthDay } from '@/lib/api';
import { formatMinutes } from '@/lib/datetime';
import { monthKey, monthLabel, shortDay, timeLabel, todayIso } from '@/lib/format';
import { useScreenData } from '@/lib/useScreenData';

/** How far back the month switcher goes. */
const MAX_BACK = 12;

function issueOf(d: MonthDay) {
  if (d.missedPunch) return 'Missed punch';
  if (d.status === 'ABSENT') return 'No punches recorded';
  if (d.isLate) return `Late · in ${timeLabel(d.firstIn)}`;
  return null;
}

export default function Attendance() {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  const ref = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const key = monthKey(ref.getFullYear(), ref.getMonth());
  const { data, loading, error, refetch } = useScreenData(() => getMonth(key), [key]);

  const today = todayIso();
  const issues = (data?.days ?? []).filter((d) => d.date < today && issueOf(d)).reverse();
  const totals = data?.totals;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Attendance" subtitle="Tap a day for in/out detail" back={false} />
      <Screen>
        <View style={styles.monthNav}>
          <Pressable
            onPress={() => setOffset(offset - 1)}
            hitSlop={10}
            style={[styles.navBtn, offset <= -MAX_BACK && { opacity: 0.3 }]}
            disabled={offset <= -MAX_BACK}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.month}>{monthLabel(ref.getFullYear(), ref.getMonth())}</Text>
          <Pressable
            onPress={() => setOffset(offset + 1)}
            hitSlop={10}
            style={[styles.navBtn, offset >= 0 && { opacity: 0.3 }]}
            disabled={offset >= 0}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>

        {loading && data?.month !== key ? (
          <>
            <SkeletonCard>
              <SkeletonDetailRows count={6} />
            </SkeletonCard>
            <SkeletonList count={3} />
          </>
        ) : error || !data || !totals ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card>
              <MonthCalendar days={data.days} today={today} onPress={(d) => router.push(`/day/${d.date}`)} />
              <CalendarLegend />
            </Card>

            <Card>
              <Text style={styles.caption}>{offset === 0 ? 'MONTH SO FAR' : 'MONTH TOTALS'}</Text>
              <View style={[styles.metrics, { marginTop: spacing.md }]}>
                <Metric label="Present" value={String(totals.present)} tone={colors.success} />
                <Metric label="Absent" value={String(totals.absent)} tone={totals.absent ? colors.danger : undefined} />
                <Metric label="Leave" value={String(totals.leave)} tone={colors.info} />
              </View>
              <View style={[styles.metrics, { marginTop: spacing.sm }]}>
                <Metric label="Worked" value={totals.workedMinutes ? formatMinutes(totals.workedMinutes) : '—'} />
                <Metric label="Late" value={String(totals.late)} tone={totals.late ? colors.warning : undefined} />
                <Metric label="Overtime" value={totals.overtimeMinutes ? formatMinutes(totals.overtimeMinutes) : '—'} />
              </View>
              {totals.remote || totals.halfDay || totals.holidays ? (
                <View style={[styles.metrics, { marginTop: spacing.sm }]}>
                  <Metric label="Remote" value={String(totals.remote)} />
                  <Metric label="Half day" value={String(totals.halfDay)} />
                  <Metric label="Holidays" value={String(totals.holidays)} />
                </View>
              ) : null}
            </Card>

            <SectionHeader title="Needs a look" />
            {issues.length ? (
              issues.map((d) => (
                <Card key={d.date} onPress={() => router.push(`/day/${d.date}`)} padded={false}>
                  <View style={styles.issue}>
                    <View style={styles.dateBox}>
                      <Text style={styles.dateNum}>{d.date.slice(8)}</Text>
                      <Text style={styles.dateDow}>{shortDay(d.date).slice(0, 3).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.issueTitle}>{issueOf(d)}</Text>
                      <Text style={styles.issueSub}>
                        {d.workedMinutes ? `${formatMinutes(d.workedMinutes)} worked` : 'Tap to request a correction'}
                      </Text>
                    </View>
                    <StatusPill status={d.status} small />
                  </View>
                </Card>
              ))
            ) : (
              <EmptyState icon="sparkles-outline" title="A clean month" message="No late marks, missed punches or absences." />
            )}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  month: { ...type.h2, color: colors.text },
  caption: { ...type.caption, color: colors.textFaint },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  issue: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  dateBox: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNum: { ...type.h3, color: colors.primary, lineHeight: 20 },
  dateDow: { ...type.caption, color: colors.primary },
  issueTitle: { ...type.bodyMed, color: colors.text },
  issueSub: { ...type.small, color: colors.textMuted },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

/**
 * Team member (manager view) — the selected day, the last seven days at a
 * glance, and their requests waiting on you.
 *
 * The mobile API has no per-employee route, so this is assembled from the
 * team-wide ones: `/team/live` for today, `/team/attendance` per day for the
 * strip, and the approvals queue for their pending requests.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Card, ErrorState, Row, SectionHeader, StatusPill } from '@/components/ui';
import { SkeletonDetail } from '@/components/Skeleton';
import { DayMetrics, RequestCard } from '@/components/attendance';
import { colors, radius, spacing, type } from '@/theme';
import { ApiError, getAllApprovals, getTeamAttendance, getTeamLive, TeamDayRow } from '@/lib/api';
import { canApprove, useMe } from '@/lib/auth';
import { formatMinutes } from '@/lib/datetime';
import { addDays, shortDay, todayIso, weekday } from '@/lib/format';
import { DAY_CODE, statusInfo } from '@/lib/status';
import { dayDetail, liveDetail } from '@/lib/team';
import { useScreenData } from '@/lib/useScreenData';

const DAYS = 7;

async function load(id: string, approver: boolean) {
  const today = todayIso();
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)));
  /* Today and the strip fail the screen rather than going blank: a day that
     did not load would otherwise read as "no attendance" — an absence. Only
     the pending-requests panel is optional. */
  const [live, days, approvals] = await Promise.all([
    getTeamLive(),
    Promise.all(dates.map((d) => getTeamAttendance(d).then((rows) => rows.find((r) => r.employeeId === id) ?? null))),
    approver ? getAllApprovals(50).catch(() => null) : Promise.resolve(null),
  ]);
  const person = live?.people.find((p) => p.employeeId === id) ?? null;
  const recent = dates.map((date, i) => ({ date, row: days[i] }));
  const anyRow = days.find(Boolean) ?? null;
  if (!person && !anyRow) throw new ApiError('This person is not on your team.', 404);
  return {
    person,
    recent,
    name: person?.fullName ?? anyRow?.fullName ?? 'Team member',
    code: person?.employeeCode ?? anyRow?.employeeCode ?? null,
    requests: (approvals?.items ?? []).filter((r) => r.employee?.id === id && r.status === 'PENDING'),
  };
}

export default function TeamMember() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const focus = date ?? todayIso();
  const approver = canApprove(useMe());
  const { data, loading, error, refetch } = useScreenData(() => load(id, approver), [id, approver]);

  const focusRow: TeamDayRow | null = data?.recent.find((d) => d.date === focus)?.row ?? null;
  const live = focus === todayIso() ? data?.person ?? null : null;
  const counted = (data?.recent ?? []).map((d) => d.row).filter((r): r is TeamDayRow => !!r);
  const worked = counted.reduce((s, r) => s + (r.workedMinutes ?? 0), 0);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={data?.name ?? 'Team member'} subtitle={data?.code ?? undefined} />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonDetail />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card>
              <View style={styles.head}>
                <Text style={styles.caption}>{focus === todayIso() ? 'TODAY' : shortDay(focus).toUpperCase()}</Text>
                {live ? <StatusPill status={live.liveState} small /> : focusRow ? <StatusPill status={focusRow.status} small /> : null}
              </View>
              <Text style={styles.title}>
                {live ? liveDetail(live) : focusRow ? dayDetail(focusRow) : 'No attendance recorded'}
              </Text>
              {live || focusRow ? (
                <View style={{ marginTop: spacing.lg }}>
                  <DayMetrics
                    firstIn={live?.firstIn ?? focusRow?.firstIn ?? null}
                    lastOut={live?.lastOut ?? focusRow?.lastOut ?? null}
                    workedMinutes={focusRow?.workedMinutes ?? null}
                    late={live?.isLate ?? focusRow?.isLate}
                    inside={!!live && ['IN', 'IN_LATE', 'REMOTE'].includes(live.liveState)}
                  />
                </View>
              ) : null}
            </Card>

            <SectionHeader title={`Last ${DAYS} days`} />
            <Card>
              <View style={styles.strip}>
                {data.recent.map(({ date: d, row }) => {
                  const info = statusInfo(row?.status ?? 'UNKNOWN');
                  return (
                    <View key={d} style={styles.stripCell}>
                      <Text style={styles.stripDow}>{weekday(d).slice(0, 2)}</Text>
                      <View style={[styles.stripBox, { backgroundColor: row ? info.bg : colors.neutralBg }, d === focus && styles.stripToday]}>
                        <Text style={[styles.stripCode, { color: row ? info.fg : colors.textFaint }]}>
                          {row ? DAY_CODE[row.status] ?? '•' : '–'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Row
                  icon="checkmark-circle-outline"
                  label="Present"
                  value={String(counted.filter((r) => !!r.firstIn).length)}
                  color={colors.success}
                />
                <Row
                  icon="alarm-outline"
                  label="Late arrivals"
                  value={String(counted.filter((r) => r.isLate).length)}
                  color={counted.some((r) => r.isLate) ? colors.warning : undefined}
                />
                <Row
                  icon="close-circle-outline"
                  label="Absent"
                  value={String(counted.filter((r) => r.status === 'ABSENT').length)}
                  color={counted.some((r) => r.status === 'ABSENT') ? colors.danger : undefined}
                />
                <Row icon="hourglass-outline" label="Worked" value={worked ? formatMinutes(worked) : '—'} />
              </View>
            </Card>

            {data.requests.length ? (
              <>
                <SectionHeader title="Waiting on you" />
                {data.requests.map((r) => (
                  <RequestCard
                    key={`${r.kind}:${r.id}`}
                    request={r}
                    onPress={() => router.push(`/request/${r.id}?kind=${r.kind}&role=manager`)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caption: { ...type.caption, color: colors.textFaint },
  title: { ...type.h3, color: colors.text, marginTop: spacing.sm },
  strip: { flexDirection: 'row', justifyContent: 'space-between' },
  stripCell: { alignItems: 'center', gap: 4, flex: 1 },
  stripDow: { ...type.caption, color: colors.textFaint },
  stripBox: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  stripToday: { borderWidth: 1, borderColor: colors.primary },
  stripCode: { ...type.caption, letterSpacing: 0 },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

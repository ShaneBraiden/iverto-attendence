/**
 * Employee · Today — shift, live state, in/out so far, mobile punch, quick
 * requests, and what's coming up.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconTile,
  Note,
  PoweredBy,
  SectionHeader,
  StatCard,
  StatusPill,
} from '@/components/ui';
import { Stagger, LiveDot } from '@/components/motion';
import { SkeletonCard, SkeletonDetailRows, SkeletonList, SkeletonStats } from '@/components/Skeleton';
import { DayMetrics, DayTimeline, RequestCard } from '@/components/attendance';
import { timeGreeting } from '@/constants/greeting';
import { colors, spacing, type } from '@/theme';
import { shiftLabel } from '@/lib/attendance';
import { formatMinutes, isoToTime } from '@/lib/datetime';
import { statusInfo } from '@/lib/status';
import { useScreenData } from '@/lib/useScreenData';
import {
  canMobilePunch,
  dayFor,
  employee,
  leaveBalances,
  ME_ID,
  mobilePunch,
  monthSummary,
  monthDays,
  requestsFor,
  schedule,
  shortDay,
  todayIso,
  unreadCount,
} from '@/lib/data';

const ME = ME_ID.employee;

function load() {
  const today = dayFor(ME, todayIso());
  const n = new Date();
  const month = monthSummary(monthDays(ME, n.getFullYear(), n.getMonth()));
  const next = schedule(ME, 8).slice(1).find((d) => d.dayType !== 'WORK' || d.leave);
  const cl = leaveBalances(ME).find((b) => b.type.code === 'CL')!;
  const pending = requestsFor(ME).filter((r) => r.status === 'PENDING');
  return { today, month, next, cl, pending, unread: unreadCount(ME) };
}

export default function EmployeeToday() {
  const me = employee(ME);
  const { data, loading, error, refetch } = useScreenData(load);
  const [punching, setPunching] = useState(false);
  const [justPunched, setJustPunched] = useState<string | null>(null);

  const doPunch = () => {
    setPunching(true);
    setTimeout(() => {
      const p = mobilePunch(ME);
      setJustPunched(`${p.direction === 'IN' ? 'Checked in' : 'Checked out'} at ${isoToTime(p.at)} · location recorded`);
      setPunching(false);
      refetch();
    }, 700);
  };

  const today = data?.today;
  const live = today?.liveState ? statusInfo(today.liveState) : null;
  const inside = today?.segments.some((s) => !s.out);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting={timeGreeting()}
        title="Employee"
        meta={`${me.name} · ${me.code}`}
        icon="person-outline"
        badgeCount={data?.unread}
        onBell={() => router.push('/notifications?role=employee')}
      />
      <Screen>
        {loading && !data ? (
          <>
            <SkeletonCard>
              <SkeletonDetailRows count={4} />
            </SkeletonCard>
            <SkeletonStats />
            <SkeletonList count={2} />
          </>
        ) : error || !data || !today ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card onPress={() => router.push(`/day/${today.date}`)}>
              <View style={styles.headRow}>
                <Text style={styles.caption}>TODAY · {shortDay(today.date).toUpperCase()}</Text>
                {live ? (
                  <View style={styles.liveRow}>
                    <LiveDot color={live.fg} />
                    <StatusPill status={today.liveState!} small />
                  </View>
                ) : (
                  <StatusPill status={today.status} small />
                )}
              </View>
              {today.shift ? (
                <>
                  <Text style={styles.title}>
                    {today.shift.name} shift · {shiftLabel(today.shift)}
                  </Text>
                  <Text style={styles.sub}>
                    {today.firstIn
                      ? inside
                        ? `Inside since ${isoToTime(today.segments[today.segments.length - 1].in)} · ${formatMinutes(today.workedMin)} worked so far`
                        : `Last out ${isoToTime(today.lastOut)} · ${formatMinutes(today.workedMin)} worked`
                      : 'Look at the M50 terminal at the gate to punch in.'}
                  </Text>
                  <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                    <DayTimeline day={today} />
                    <DayMetrics day={today} />
                  </View>
                </>
              ) : (
                <Text style={styles.title}>
                  {today.holidayName ?? (today.leave ? 'On leave today' : 'Weekly off')} — enjoy the day
                </Text>
              )}
            </Card>

            {today.lateMin > 0 ? (
              <Note icon="alarm-outline" tone="warning" text={`You were ${today.lateMin} min late today (grace is 10 min).`} />
            ) : null}

            {canMobilePunch(ME, today) ? (
              <Card>
                <View style={styles.punchRow}>
                  <IconTile icon="location-outline" size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Field check-{inside ? 'out' : 'in'}</Text>
                    <Text style={styles.sub}>
                      You can punch from the app. Server time is used; your location is saved for audit.
                    </Text>
                  </View>
                </View>
                <Button
                  label={inside ? 'Check out here' : 'Check in here'}
                  icon={inside ? 'log-out-outline' : 'log-in-outline'}
                  variant={inside ? 'secondary' : 'primary'}
                  loading={punching}
                  onPress={doPunch}
                  style={{ marginTop: spacing.lg }}
                />
                {justPunched ? <Text style={styles.done}>✓ {justPunched}</Text> : null}
              </Card>
            ) : null}

            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard
                  label="Present"
                  value={String(data.month.present)}
                  icon="checkmark-circle-outline"
                  fg={colors.success}
                  bg={colors.successBg}
                  onPress={() => router.push('/employee/attendance')}
                />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Late" value={String(data.month.late)} icon="alarm-outline" fg={colors.warning} bg={colors.warningBg} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard
                  label="CL left"
                  value={String(data.cl.available)}
                  icon="airplane-outline"
                  fg={colors.info}
                  bg={colors.infoBg}
                  onPress={() => router.push('/employee/requests')}
                />
              </Stagger>
            </View>

            {data.month.missed > 0 ? (
              <Card onPress={() => router.push('/employee/attendance')}>
                <View style={styles.punchRow}>
                  <IconTile icon="alert-circle-outline" tint={colors.danger} bg={colors.dangerBg} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {data.month.missed} missed punch{data.month.missed > 1 ? 'es' : ''} this month
                    </Text>
                    <Text style={styles.sub}>Open the day and request a correction.</Text>
                  </View>
                </View>
              </Card>
            ) : null}

            <SectionHeader title="Quick requests" />
            <View style={styles.quick}>
              {(
                [
                  ['LEAVE', 'Apply leave', 'airplane-outline'],
                  ['CORRECTION', 'Fix a punch', 'create-outline'],
                  ['REMOTE', 'Work remote', 'home-outline'],
                ] as const
              ).map(([kind, label, icon]) => (
                <Stagger key={kind} style={{ flex: 1 }}>
                  <Card onPress={() => router.push(`/request/new?kind=${kind}`)}>
                    <View style={{ alignItems: 'center', gap: spacing.sm }}>
                      <IconTile icon={icon} size={40} />
                      <Text style={styles.quickLabel}>{label}</Text>
                    </View>
                  </Card>
                </Stagger>
              ))}
            </View>

            {data.next ? (
              <Card onPress={() => router.push('/schedule')}>
                <View style={styles.punchRow}>
                  <IconTile icon="calendar-outline" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.caption}>COMING UP</Text>
                    <Text style={styles.cardTitle}>
                      {shortDay(data.next.date)} · {data.next.holidayName ?? (data.next.leave ? 'Leave' : 'Weekly off')}
                    </Text>
                  </View>
                  <Text style={styles.link}>Roster</Text>
                </View>
              </Card>
            ) : null}

            <SectionHeader
              title="Awaiting approval"
              actionLabel={data.pending.length ? 'All requests' : undefined}
              onAction={() => router.push('/employee/requests')}
            />
            {data.pending.length ? (
              data.pending.slice(0, 2).map((r) => (
                <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}`)} />
              ))
            ) : (
              <EmptyState icon="checkmark-done-outline" title="Nothing pending" message="Your leave, remote and correction requests will show here." />
            )}
          </>
        )}
        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  caption: { ...type.caption, color: colors.textFaint },
  title: { ...type.h2, color: colors.text, marginTop: spacing.sm },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  cardTitle: { ...type.bodyMed, color: colors.text },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  done: { ...type.smallMed, color: colors.success, marginTop: spacing.md, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  quick: { flexDirection: 'row', gap: spacing.sm },
  quickLabel: { ...type.smallMed, color: colors.text, textAlign: 'center' },
  link: { ...type.smallMed, color: colors.primary },
});

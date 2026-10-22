/**
 * Manager · Live — the condensed live board (§10): headcount per live state,
 * terminals that have gone quiet, who needs attention, and the whole team.
 * Re-reads every minute while it is on screen.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import { Card, Chip, EmptyState, ErrorState, IconTile, Note, PoweredBy, SectionHeader, StatCard } from '@/components/ui';
import { LiveDot, Stagger } from '@/components/motion';
import { SkeletonList, SkeletonStats } from '@/components/Skeleton';
import { MemberRow } from '@/components/attendance';
import { timeGreeting } from '@/constants/greeting';
import { colors, spacing, type } from '@/theme';
import { getAllApprovals, getNotifications, getTeamLive } from '@/lib/api';
import { canApprove, canViewTeam, useMe } from '@/lib/auth';
import { isoToTime } from '@/lib/datetime';
import { liveDetail } from '@/lib/team';
import { useScreenData } from '@/lib/useScreenData';

const LIVE_GROUPS: { key: string; label: string; states: string[] }[] = [
  { key: 'in', label: 'In', states: ['IN', 'IN_LATE', 'REMOTE', 'ON_BREAK'] },
  { key: 'late', label: 'Late', states: ['IN_LATE', 'LATE_NOT_IN'] },
  { key: 'notin', label: 'Not in', states: ['NOT_YET_IN', 'LATE_NOT_IN'] },
  { key: 'absent', label: 'Absent', states: ['ABSENT'] },
  { key: 'leave', label: 'Leave', states: ['ON_LEAVE'] },
  { key: 'left', label: 'Left', states: ['LEFT'] },
  { key: 'off', label: 'Off', states: ['OFF'] },
];

const REFRESH_MS = 60_000;

const optional = <T,>(p: Promise<T>) => p.catch(() => null);

export default function LiveBoard() {
  const me = useMe();
  /* An approver without `teamView` has no board; the queue is their home. */
  if (!canViewTeam(me)) return <Redirect href="/manager/approvals" />;
  return <Board />;
}

function Board() {
  const me = useMe();
  const approver = canApprove(me);
  const [filter, setFilter] = useState('all');
  const { data, loading, error, refetch } = useScreenData(async () => {
    const [board, approvals, inbox] = await Promise.all([
      getTeamLive(),
      approver ? optional(getAllApprovals(30)) : Promise.resolve(null),
      optional(getNotifications(null, 1)),
    ]);
    return {
      board,
      pending: approvals ? approvals.items.filter((r) => r.status === 'PENDING').length : 0,
      morePending: !!approvals?.more,
      unread: inbox?.unreadCount,
    };
  });

  useFocusEffect(
    useCallback(() => {
      const t = setInterval(refetch, REFRESH_MS);
      return () => clearInterval(t);
    }, [refetch]),
  );

  const board = data?.board;
  const people = board?.people ?? [];
  const group = LIVE_GROUPS.find((g) => g.key === filter);
  const rows = people.filter((p) => !group || group.states.includes(p.liveState));
  const count = (key: string) => {
    const g = LIVE_GROUPS.find((x) => x.key === key)!;
    return people.filter((p) => g.states.includes(p.liveState)).length;
  };
  const attention = people.filter((p) => p.liveState === 'LATE_NOT_IN' || p.liveState === 'ABSENT' || p.liveState === 'IN_LATE');
  const s = board?.summary;

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting={timeGreeting()}
        title="Manager"
        meta={`${me.employee?.fullName ?? me.displayName}${me.employee?.department ? ` · ${me.employee.department.name}` : ''}`}
        icon="people-outline"
        badgeCount={data?.unread}
        onBell={() => router.push('/notifications')}
      />
      <Screen>
        {loading && !data ? (
          <>
            <SkeletonStats count={3} />
            <SkeletonStats count={3} />
            <SkeletonList count={4} />
          </>
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : board && s ? (
          <>
            <View style={styles.liveHead}>
              <View style={styles.liveRow}>
                <LiveDot color={error ? colors.warning : colors.success} />
                <Text style={styles.liveText}>
                  {error ? 'Offline · last updated' : 'Live · updated'} {isoToTime(board.generatedAt)}
                  {s.scheduled ? ` · ${s.scheduled} scheduled` : ''}
                </Text>
              </View>
              <Text style={styles.refresh} onPress={refetch}>
                Refresh
              </Text>
            </View>

            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="In" value={String(s.present)} icon="log-in-outline" fg={colors.success} bg={colors.successBg} onPress={() => setFilter('in')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Late" value={String(s.late)} icon="alarm-outline" fg={colors.warning} bg={colors.warningBg} onPress={() => setFilter('late')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Absent" value={String(s.absent)} icon="close-circle-outline" fg={colors.danger} bg={colors.dangerBg} onPress={() => setFilter('absent')} />
              </Stagger>
            </View>
            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Not in" value={String(s.notYetIn)} icon="hourglass-outline" fg={colors.textMuted} bg={colors.neutralBg} onPress={() => setFilter('notin')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Leave" value={String(s.onLeave)} icon="airplane-outline" fg={colors.info} bg={colors.infoBg} onPress={() => setFilter('leave')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Remote" value={String(s.remote)} icon="home-outline" fg={colors.info} bg={colors.infoBg} onPress={() => setFilter('in')} />
              </Stagger>
            </View>

            {data.pending ? (
              <Card onPress={() => router.push('/manager/approvals')}>
                <View style={styles.row}>
                  <IconTile icon="checkmark-done-outline" size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {data.pending}
                      {data.morePending ? '+' : ''} request{data.pending > 1 ? 's' : ''} waiting on you
                    </Text>
                    <Text style={styles.sub}>Leave, punch corrections and remote work</Text>
                  </View>
                  <Text style={styles.link}>Review</Text>
                </View>
              </Card>
            ) : null}

            {board.offlineDevices.map((d) => (
              <Note
                key={d.id}
                icon="hardware-chip-outline"
                tone="danger"
                text={`${d.name}${d.gateName ? ` (${d.gateName})` : ''} terminal is offline — its punches will backfill on reconnect, so some "absent" marks may clear.`}
              />
            ))}

            <SectionHeader title="Needs attention" />
            {attention.length ? (
              attention.map((p) => (
                <MemberRow
                  key={p.employeeId}
                  name={p.fullName}
                  detail={liveDetail(p)}
                  status={p.liveState}
                  onPress={() => router.push(`/team/${p.employeeId}`)}
                />
              ))
            ) : (
              <EmptyState icon="happy-outline" title="All on track" message="No late arrivals or absences right now." />
            )}

            <SectionHeader title={`Team · ${people.length}`} />
            <View style={styles.chips}>
              <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
              {LIVE_GROUPS.map((g) => (
                <Chip key={g.key} label={`${g.label} · ${count(g.key)}`} selected={filter === g.key} onPress={() => setFilter(g.key)} />
              ))}
            </View>
            {rows.length ? (
              rows.map((p) => (
                <MemberRow
                  key={p.employeeId}
                  name={p.fullName}
                  detail={liveDetail(p)}
                  status={p.liveState}
                  onPress={() => router.push(`/team/${p.employeeId}`)}
                />
              ))
            ) : (
              <EmptyState
                icon="people-outline"
                title={people.length ? 'Nobody here' : 'No team yet'}
                message={people.length ? 'No one on your team is in this state right now.' : "HR hasn't assigned anyone to you."}
              />
            )}
          </>
        ) : null}
        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  liveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  liveText: { ...type.smallMed, color: colors.textMuted, flexShrink: 1 },
  refresh: { ...type.smallMed, color: colors.primary },
  stats: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { ...type.bodyMed, color: colors.text },
  sub: { ...type.small, color: colors.textMuted },
  link: { ...type.smallMed, color: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

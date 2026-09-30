/**
 * Manager · Live — the condensed live board (§10): counts per live state,
 * terminal health, who needs attention, latest punches, the whole team.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconTile,
  Note,
  PoweredBy,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { LiveDot, Stagger } from '@/components/motion';
import { SkeletonList, SkeletonStats } from '@/components/Skeleton';
import { MemberRow } from '@/components/attendance';
import { timeGreeting } from '@/constants/greeting';
import { colors, radius, spacing, type } from '@/theme';
import { isoToTime } from '@/lib/datetime';
import { useScreenData } from '@/lib/useScreenData';
import { approvalsFor, employee, LIVE_GROUPS, liveBoard, ME_ID, unreadCount } from '@/lib/data';

const ME = ME_ID.manager;

export default function LiveBoard() {
  const me = employee(ME);
  const [filter, setFilter] = useState('all');
  const { data, loading, error, refetch } = useScreenData(() => ({
    board: liveBoard(ME),
    pending: approvalsFor(ME).filter((r) => r.status === 'PENDING').length,
    unread: unreadCount(ME),
  }));

  const board = data?.board;
  const group = LIVE_GROUPS.find((g) => g.key === filter);
  const rows = (board?.rows ?? []).filter((r) => !group || (r.day.liveState && group.states.includes(r.day.liveState)));
  const attention = (board?.rows ?? []).filter(
    (r) => r.day.liveState === 'LATE_NOT_IN' || r.day.liveState === 'ABSENT' || r.day.liveState === 'IN_LATE',
  );
  const offline = board?.devices.filter((d) => !d.online) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting={timeGreeting()}
        title="Manager"
        meta={`${me.name} · ${me.department}`}
        icon="people-outline"
        badgeCount={data?.unread}
        onBell={() => router.push('/notifications?role=manager')}
      />
      <Screen>
        {loading && !data ? (
          <>
            <SkeletonStats count={3} />
            <SkeletonStats count={3} />
            <SkeletonList count={4} />
          </>
        ) : error || !board ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <View style={styles.liveHead}>
              <View style={styles.liveRow}>
                <LiveDot color={colors.success} />
                <Text style={styles.liveText}>Live · updated {isoToTime(board.updatedAt)}</Text>
              </View>
              <Text style={styles.refresh} onPress={refetch}>
                Refresh
              </Text>
            </View>

            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="In" value={String(board.counts.in)} icon="log-in-outline" fg={colors.success} bg={colors.successBg} onPress={() => setFilter('in')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Late" value={String(board.counts.late)} icon="alarm-outline" fg={colors.warning} bg={colors.warningBg} onPress={() => setFilter('late')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Absent" value={String(board.counts.absent)} icon="close-circle-outline" fg={colors.danger} bg={colors.dangerBg} onPress={() => setFilter('absent')} />
              </Stagger>
            </View>
            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Not in" value={String(board.counts.notin)} icon="hourglass-outline" fg={colors.textMuted} bg={colors.neutralBg} onPress={() => setFilter('notin')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Leave" value={String(board.counts.leave)} icon="airplane-outline" fg={colors.info} bg={colors.infoBg} onPress={() => setFilter('leave')} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Off" value={String(board.counts.off)} icon="cafe-outline" fg={colors.textMuted} bg={colors.neutralBg} onPress={() => setFilter('off')} />
              </Stagger>
            </View>

            {data.pending ? (
              <Card onPress={() => router.push('/manager/approvals')}>
                <View style={styles.row}>
                  <IconTile icon="checkmark-done-outline" size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {data.pending} request{data.pending > 1 ? 's' : ''} waiting on you
                    </Text>
                    <Text style={styles.sub}>Leave, punch corrections and remote work</Text>
                  </View>
                  <Text style={styles.link}>Review</Text>
                </View>
              </Card>
            ) : null}

            {offline.map((d) => (
              <Note
                key={d.id}
                icon="hardware-chip-outline"
                tone="danger"
                text={`${d.name} terminal offline for ${d.lastSeenMin} min — its punches will backfill on reconnect, so some "absent" marks may clear.`}
              />
            ))}

            <SectionHeader title="Needs attention" />
            {attention.length ? (
              attention.map((r) => (
                <MemberRow key={r.employee.id} employee={r.employee} day={r.day} onPress={() => router.push(`/team/${r.employee.id}`)} />
              ))
            ) : (
              <EmptyState icon="happy-outline" title="All on track" message="No late arrivals or absences right now." />
            )}

            <SectionHeader title="Latest punches" />
            <Card>
              {board.recent.length ? (
                <View style={{ gap: spacing.md }}>
                  {board.recent.map(({ punch, employee: e }) => (
                    <View key={punch.id + e.id} style={styles.row}>
                      <View style={styles.timeBox}>
                        <Text style={styles.time}>{isoToTime(punch.at)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {e.name}
                        </Text>
                        <Text style={styles.sub} numberOfLines={1}>
                          {punch.device}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.sub}>No punches yet today.</Text>
              )}
            </Card>

            <SectionHeader title={`Team · ${board.rows.length}`} />
            <View style={styles.chips}>
              <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
              {LIVE_GROUPS.map((g) => (
                <Chip key={g.key} label={`${g.label} · ${board.counts[g.key]}`} selected={filter === g.key} onPress={() => setFilter(g.key)} />
              ))}
            </View>
            {rows.length ? (
              rows.map((r) => (
                <MemberRow key={r.employee.id} employee={r.employee} day={r.day} onPress={() => router.push(`/team/${r.employee.id}`)} />
              ))
            ) : (
              <EmptyState icon="people-outline" title="Nobody here" message="No one on your team is in this state right now." />
            )}
          </>
        )}
        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  liveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveText: { ...type.smallMed, color: colors.textMuted },
  refresh: { ...type.smallMed, color: colors.primary },
  stats: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { ...type.bodyMed, color: colors.text },
  sub: { ...type.small, color: colors.textMuted },
  link: { ...type.smallMed, color: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeBox: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  time: { ...type.smallMed, color: colors.primary },
});

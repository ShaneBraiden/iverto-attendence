/**
 * Manager · Team — team attendance for today or any of the last six days:
 * summary counts and each person's status with in/out.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Chip, EmptyState, ErrorState, SectionHeader, StatCard } from '@/components/ui';
import { Stagger } from '@/components/motion';
import { SkeletonList, SkeletonStats } from '@/components/Skeleton';
import { MemberRow } from '@/components/attendance';
import { colors, spacing } from '@/theme';
import { getTeamAttendance, TeamDayRow } from '@/lib/api';
import { addDays, shortDay, todayIso } from '@/lib/format';
import { dayDetail } from '@/lib/team';
import { useScreenData } from '@/lib/useScreenData';

const PRESENT = new Set(['PRESENT', 'REMOTE', 'HALF_DAY', 'HALF_LEAVE', 'IN', 'IN_LATE', 'ON_BREAK', 'LEFT']);
const LEAVE = new Set(['ON_LEAVE', 'LEAVE']);

export default function Team() {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(todayIso(), -i));
  const [date, setDate] = useState(dates[0]);
  const { data, loading, error, refetch } = useScreenData(() => getTeamAttendance(date), [date]);
  const rows = data ?? [];
  const count = (pred: (r: TeamDayRow) => boolean) => rows.filter(pred).length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Team attendance" subtitle={shortDay(date)} back={false} />
      <Screen>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {dates.map((d, i) => (
            <Chip key={d} label={i === 0 ? 'Today' : i === 1 ? 'Yesterday' : shortDay(d)} selected={d === date} onPress={() => setDate(d)} />
          ))}
        </ScrollView>

        {loading ? (
          <>
            <SkeletonStats count={4} columns={2} />
            <SkeletonList count={5} />
          </>
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard
                  label="Present"
                  value={String(count((r) => PRESENT.has(r.status) || !!r.firstIn))}
                  icon="checkmark-circle-outline"
                  fg={colors.success}
                  bg={colors.successBg}
                />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Late" value={String(count((r) => r.isLate))} icon="alarm-outline" fg={colors.warning} bg={colors.warningBg} />
              </Stagger>
            </View>
            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard
                  label="Absent"
                  value={String(count((r) => r.status === 'ABSENT'))}
                  icon="close-circle-outline"
                  fg={colors.danger}
                  bg={colors.dangerBg}
                />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="On leave" value={String(count((r) => LEAVE.has(r.status)))} icon="airplane-outline" fg={colors.info} bg={colors.infoBg} />
              </Stagger>
            </View>

            <SectionHeader title={`${rows.length} people`} />
            {rows.length ? (
              rows.map((r) => (
                <MemberRow
                  key={r.employeeId}
                  name={r.fullName}
                  detail={dayDetail(r)}
                  status={r.status}
                  onPress={() => router.push(`/team/${r.employeeId}?date=${date}`)}
                />
              ))
            ) : (
              <EmptyState icon="people-outline" title="No team yet" message="HR hasn't assigned anyone to you." />
            )}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.sm },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

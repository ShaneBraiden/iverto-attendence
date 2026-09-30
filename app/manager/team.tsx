/**
 * Manager · Team — daily team attendance for today or any of the last six
 * days: summary counts and each person's status with in/out.
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
import { useScreenData } from '@/lib/useScreenData';
import { addDays, ME_ID, shortDay, teamDay, todayIso } from '@/lib/data';

const ME = ME_ID.manager;
const DATES = Array.from({ length: 7 }, (_, i) => addDays(todayIso(), -i));

export default function Team() {
  const [date, setDate] = useState(DATES[0]);
  const { data, loading, error, refetch } = useScreenData(() => teamDay(ME, date), [date]);
  const isToday = date === DATES[0];

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Team attendance" subtitle={shortDay(date)} back={false} />
      <Screen>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {DATES.map((d, i) => (
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
                <StatCard label="Present" value={String(data.summary.present)} icon="checkmark-circle-outline" fg={colors.success} bg={colors.successBg} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Late" value={String(data.summary.late)} icon="alarm-outline" fg={colors.warning} bg={colors.warningBg} />
              </Stagger>
            </View>
            <View style={styles.stats}>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="Absent" value={String(data.summary.absent)} icon="close-circle-outline" fg={colors.danger} bg={colors.dangerBg} />
              </Stagger>
              <Stagger style={{ flex: 1 }}>
                <StatCard label="On leave" value={String(data.summary.leave)} icon="airplane-outline" fg={colors.info} bg={colors.infoBg} />
              </Stagger>
            </View>

            <SectionHeader title={`${data.rows.length} people`} />
            {data.rows.length ? (
              data.rows.map((r) => (
                <MemberRow
                  key={r.employee.id}
                  employee={r.employee}
                  day={r.day}
                  showLive={isToday}
                  onPress={() => router.push(`/team/${r.employee.id}?date=${date}`)}
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

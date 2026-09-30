/**
 * Upcoming holidays from the site's holiday calendar.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen, TopBar } from '@/components/Screen';
import { Card, EmptyState, ErrorState, IconTile } from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { colors, spacing, type } from '@/theme';
import { useScreenData } from '@/lib/useScreenData';
import { addDays, dayDate, shortDay, todayIso, upcomingHolidays } from '@/lib/data';

function inDays(date: string) {
  const n = Math.round((dayDate(date).getTime() - dayDate(todayIso()).getTime()) / 86_400_000);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

export default function Holidays() {
  const { data, loading, error, refetch } = useScreenData(upcomingHolidays);
  const soon = addDays(todayIso(), 14);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Holidays" subtitle="Karnataka · Bengaluru HQ" />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonList count={5} />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length ? (
          data.map((h) => (
            <Card key={h.date} strong={h.date <= soon}>
              <View style={styles.row}>
                <IconTile icon="sunny-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{h.name}</Text>
                  <Text style={styles.sub}>
                    {shortDay(h.date)} {h.date.slice(0, 4)}
                  </Text>
                </View>
                <Text style={[styles.when, h.date <= soon && { color: colors.primary }]}>{inDays(h.date)}</Text>
              </View>
            </Card>
          ))
        ) : (
          <EmptyState icon="sunny-outline" title="No holidays left" message="HR hasn't published next year's calendar yet." />
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.bodyMed, color: colors.text },
  sub: { ...type.small, color: colors.textMuted },
  when: { ...type.smallMed, color: colors.textMuted },
});

/**
 * Upcoming holidays from the site's holiday calendar. Late in the year the
 * next year's calendar is read too, so the list never runs dry in December.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen, TopBar } from '@/components/Screen';
import { Card, EmptyState, ErrorState, IconTile } from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { colors, spacing, type } from '@/theme';
import { getHolidays } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { addDays, dayDate, shortDay, todayIso } from '@/lib/format';
import { useScreenData } from '@/lib/useScreenData';

function inDays(date: string) {
  const n = Math.round((dayDate(date).getTime() - dayDate(todayIso()).getTime()) / 86_400_000);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

async function load() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const years = Number(today.slice(5, 7)) >= 10 ? [year, year + 1] : [year];
  const lists = await Promise.all(
    years.map((y, i) => (i === 0 ? getHolidays(y) : getHolidays(y).catch(() => null))),
  );
  return lists
    .flatMap((l) => l?.holidays ?? [])
    .filter((h) => h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function Holidays() {
  const me = useMe();
  const { data, loading, error, refetch } = useScreenData(load);
  const soon = addDays(todayIso(), 14);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Holidays" subtitle={me.employee?.site?.name ?? 'Your site'} />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonList count={5} />
        ) : !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length ? (
          data.map((h) => (
            <Card key={`${h.date}-${h.name}`} strong={h.date <= soon}>
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

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

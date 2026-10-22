/**
 * My roster — the next 14 days as the schedule resolver sees them
 * (override → holiday → pattern / fixed shift → weekly off, §7.1).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen, TopBar } from '@/components/Screen';
import { Card, EmptyState, ErrorState, Note, StatusPill } from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { colors, radius, spacing, type } from '@/theme';
import { getSchedule } from '@/lib/api';
import { shiftTimes, shortDay, todayIso } from '@/lib/format';
import { statusInfo } from '@/lib/status';
import { useScreenData } from '@/lib/useScreenData';

export default function Schedule() {
  const { data, loading, error, refetch } = useScreenData(() => getSchedule());
  const today = todayIso();

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="My roster" subtitle={`Next 14 days${data?.timezone ? ` · ${data.timezone}` : ''}`} />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonList count={6} avatar={false} />
        ) : !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.days.length ? (
          <>
            <Card padded={false}>
              {data.days.map((d, i) => {
                const isToday = d.date === today;
                const working = !!d.shift;
                const times = shiftTimes(d.local?.start, d.local?.end);
                return (
                  <View key={d.date} style={[styles.row, i > 0 && styles.divider]}>
                    <View style={[styles.dateBox, isToday && styles.todayBox, d.shift?.color && !isToday ? { backgroundColor: `${d.shift.color}22` } : null]}>
                      <Text style={[styles.dateNum, isToday && { color: colors.onPrimary }]}>{d.date.slice(8)}</Text>
                      <Text style={[styles.dow, isToday && { color: colors.onPrimary }]}>{shortDay(d.date).slice(0, 3).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>
                        {working ? `${d.shift!.name} shift` : d.holidayName ?? statusInfo(d.dayType).label}
                      </Text>
                      <Text style={styles.sub}>
                        {working ? times ?? d.shift!.code : d.holidayName ? 'Public holiday' : 'Rest day'}
                        {d.override ? ' · changed by your manager' : ''}
                      </Text>
                    </View>
                    {!working ? <StatusPill status={d.dayType} small /> : d.override ? <StatusPill status="OVERRIDE" small /> : null}
                  </View>
                );
              })}
            </Card>
            <Note
              icon="information-circle-outline"
              tone="info"
              text="Shift swaps and overrides are made by your manager or HR. Changes show up here and in notifications."
            />
          </>
        ) : (
          <EmptyState icon="calendar-outline" title="No roster yet" message="HR hasn't assigned you a shift for the next two weeks." />
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  dateBox: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBox: { backgroundColor: colors.primary },
  dateNum: { ...type.h3, color: colors.primary, lineHeight: 20 },
  dow: { ...type.caption, color: colors.primary },
  title: { ...type.bodyMed, color: colors.text },
  sub: { ...type.small, color: colors.textMuted },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

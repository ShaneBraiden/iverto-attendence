/**
 * My roster — the next 14 days as the schedule resolver sees them
 * (override → holiday → pattern / fixed shift → weekly off, §7.1).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen, TopBar } from '@/components/Screen';
import { Card, ErrorState, Note, StatusPill } from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { colors, radius, spacing, type } from '@/theme';
import { shiftLabel } from '@/lib/attendance';
import { useScreenData } from '@/lib/useScreenData';
import { leaveType, ME_ID, schedule, shortDay } from '@/lib/data';

export default function Schedule() {
  const { data, loading, error, refetch } = useScreenData(() => schedule(ME_ID.employee, 14));

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="My roster" subtitle="Next 14 days · site time (IST)" />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonList count={6} avatar={false} />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card padded={false}>
              {data.map((d, i) => (
                <View key={d.date} style={[styles.row, i > 0 && styles.divider]}>
                  <View style={[styles.dateBox, d.isToday && styles.todayBox]}>
                    <Text style={[styles.dateNum, d.isToday && { color: colors.onPrimary }]}>{d.date.slice(8)}</Text>
                    <Text style={[styles.dow, d.isToday && { color: colors.onPrimary }]}>
                      {shortDay(d.date).slice(0, 3).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>
                      {d.leave ? leaveType(d.leave.code).name : d.shift ? `${d.shift.name} shift` : d.holidayName ?? 'Weekly off'}
                    </Text>
                    <Text style={styles.sub}>
                      {d.shift ? shiftLabel(d.shift) : d.holidayName ? 'Public holiday' : 'Rest day'}
                      {d.leave?.half ? ` · ${d.leave.half === 'FIRST' ? 'first' : 'second'} half off` : ''}
                    </Text>
                  </View>
                  {d.leave ? (
                    <StatusPill status="ON_LEAVE" small />
                  ) : !d.shift ? (
                    <StatusPill status={d.dayType} small />
                  ) : d.requests.some((r) => r.kind === 'REMOTE' && r.status === 'APPROVED') ? (
                    <StatusPill status="REMOTE" small />
                  ) : null}
                </View>
              ))}
            </Card>
            <Note
              icon="information-circle-outline"
              tone="info"
              text="Shift swaps and overrides are made by your manager or HR. Changes show up here and in notifications."
            />
          </>
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

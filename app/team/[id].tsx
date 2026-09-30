/**
 * Team member (manager view) — today's live row, the last two weeks at a
 * glance, and their requests.
 */
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, ErrorState, Row, SectionHeader, StatusPill } from '@/components/ui';
import { SkeletonDetail } from '@/components/Skeleton';
import { DayMetrics, DayTimeline, RequestCard } from '@/components/attendance';
import { colors, radius, spacing, type } from '@/theme';
import { shiftLabel } from '@/lib/attendance';
import { formatMinutes } from '@/lib/datetime';
import { DAY_CODE, statusInfo } from '@/lib/status';
import { useScreenData } from '@/lib/useScreenData';
import { addDays, dayFor, employee, monthSummary, requestsFor, shiftOf, todayIso, weekday } from '@/lib/data';

export default function TeamMember() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const e = employee(id);
  const focus = date ?? todayIso();
  const { data, loading, error, refetch } = useScreenData(() => {
    const day = dayFor(id, focus);
    const recent = Array.from({ length: 14 }, (_, i) => dayFor(id, addDays(todayIso(), i - 13)));
    return { day, recent, summary: monthSummary(recent), requests: requestsFor(id).slice(0, 4) };
  }, [id, focus]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={e.name} subtitle={`${e.designation} · ${e.code}`} />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonDetail />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card onPress={() => router.push(`/day/${focus}?emp=${id}`)}>
              <View style={styles.head}>
                <Text style={styles.caption}>{focus === todayIso() ? 'TODAY' : focus}</Text>
                <StatusPill status={data.day.isToday && data.day.liveState ? data.day.liveState : data.day.status} small />
              </View>
              <Text style={styles.title}>
                {data.day.shift ? `${data.day.shift.name} · ${shiftLabel(data.day.shift)}` : data.day.holidayName ?? 'Off'}
              </Text>
              {data.day.shift ? (
                <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                  <DayTimeline day={data.day} />
                  <DayMetrics day={data.day} />
                </View>
              ) : null}
            </Card>

            <SectionHeader title="Last 14 days" />
            <Card>
              <View style={styles.strip}>
                {data.recent.map((d) => {
                  const info = statusInfo(d.status);
                  return (
                    <View key={d.date} style={styles.stripCell}>
                      <Text style={styles.stripDow}>{weekday(d.date).slice(0, 1)}</Text>
                      <View style={[styles.stripBox, { backgroundColor: info.bg }, d.isToday && styles.stripToday]}>
                        <Text style={[styles.stripCode, { color: info.fg }]}>{DAY_CODE[d.status]}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Row icon="checkmark-circle-outline" label="Present" value={String(data.summary.present)} color={colors.success} />
                <Row icon="alarm-outline" label="Late arrivals" value={String(data.summary.late)} color={data.summary.late ? colors.warning : undefined} />
                <Row icon="close-circle-outline" label="Absent" value={String(data.summary.absent)} color={data.summary.absent ? colors.danger : undefined} />
                <Row icon="hourglass-outline" label="Worked" value={formatMinutes(data.summary.workedMin)} />
              </View>
            </Card>

            <Card>
              <View style={{ gap: spacing.md }}>
                <Row icon="git-branch-outline" label="Department" value={e.department} />
                <Row icon="time-outline" label="Shift" value={`${shiftOf(e).name} · ${shiftLabel(shiftOf(e))}`} />
                <Row icon="phone-portrait-outline" label="Mobile punch" value={e.mobilePunch === 'NEVER' ? 'Not allowed' : e.mobilePunch === 'ALWAYS' ? 'Always (field)' : 'Remote days'} />
                <Row icon="scan-outline" label="Face enrolled" value={`${e.facesEnrolled} of 4 terminals`} color={e.facesEnrolled < 4 ? colors.warning : undefined} />
                <Row icon="call-outline" label="Phone" value={e.phone} />
              </View>
            </Card>
            <Button label={`Call ${e.name.split(' ')[0]}`} icon="call-outline" variant="secondary" onPress={() => Linking.openURL(`tel:${e.phone.replace(/\s/g, '')}`)} />

            {data.requests.length ? (
              <>
                <SectionHeader title="Recent requests" />
                {data.requests.map((r) => (
                  <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}?role=manager`)} />
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
  title: { ...type.h2, color: colors.text, marginTop: spacing.sm },
  strip: { flexDirection: 'row', justifyContent: 'space-between' },
  stripCell: { alignItems: 'center', gap: 4, flex: 1 },
  stripDow: { ...type.caption, color: colors.textFaint },
  stripBox: { width: 20, height: 28, borderRadius: radius.sm / 2, alignItems: 'center', justifyContent: 'center' },
  stripToday: { borderWidth: 1, borderColor: colors.primary },
  stripCode: { ...type.caption, letterSpacing: 0 },
});

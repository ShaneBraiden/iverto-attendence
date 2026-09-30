/**
 * Day detail — the "Detailed In/Out" drawer (§1): status, flags, worked
 * segments, and every punch with its device / source. Own days offer a
 * correction request.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, EmptyState, ErrorState, Note, Row, SectionHeader, StatusPill } from '@/components/ui';
import { SkeletonDetail } from '@/components/Skeleton';
import { DayMetrics, DayTimeline, PunchList, RequestCard } from '@/components/attendance';
import { colors, spacing, type } from '@/theme';
import { shiftLabel } from '@/lib/attendance';
import { formatMinutes, isoToTime } from '@/lib/datetime';
import { useScreenData } from '@/lib/useScreenData';
import { dayFor, employee, leaveType, ME_ID, shortDay } from '@/lib/data';

export default function DayDetail() {
  const params = useLocalSearchParams<{ date: string; emp?: string }>();
  const empId = params.emp ?? ME_ID.employee;
  const own = empId === ME_ID.employee;
  const { data: day, loading, error, refetch } = useScreenData(() => dayFor(empId, params.date), [params.date, empId]);

  const pendingCorrection = day?.requests.some((r) => r.kind === 'CORRECTION' && r.status === 'PENDING');
  const canCorrect = own && day && !day.future && day.dayType === 'WORK' && !day.leave && !pendingCorrection;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={shortDay(params.date)} subtitle={own ? 'My attendance' : employee(empId).name} />
      <Screen clearTabBar={false}>
        {loading && !day ? (
          <SkeletonDetail />
        ) : error || !day ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card>
              <View style={styles.head}>
                <Text style={styles.caption}>{day.isToday ? 'TODAY' : day.future ? 'SCHEDULED' : 'FINAL STATUS'}</Text>
                <View style={styles.pills}>
                  {day.liveState && day.isToday ? <StatusPill status={day.liveState} small /> : null}
                  {!day.future ? <StatusPill status={day.status} small /> : null}
                </View>
              </View>
              <Text style={styles.title}>
                {day.shift ? `${day.shift.name} · ${shiftLabel(day.shift)}` : day.holidayName ?? 'Weekly off'}
              </Text>
              {day.shift && !day.future ? (
                <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                  <DayTimeline day={day} />
                  <DayMetrics day={day} />
                </View>
              ) : null}
            </Card>

            {day.missedPunch && !day.corrected ? (
              <Note icon="alert-circle-outline" tone="danger" text="A punch is missing — there's an in without an out (or the reverse). Request a correction so the day is counted." />
            ) : null}
            {day.corrected ? (
              <Note icon="create-outline" tone="brand" text="This day includes an approved correction. The original punches are kept alongside it." />
            ) : null}
            {day.leave ? (
              <Note
                icon="airplane-outline"
                tone="info"
                text={`${leaveType(day.leave.code).name}${day.leave.half ? ` · ${day.leave.half === 'FIRST' ? 'first' : 'second'} half` : ''} approved for this day.`}
              />
            ) : null}

            {!day.future && day.dayType === 'WORK' ? (
              <Card>
                <View style={{ gap: spacing.md }}>
                  <Row icon="time-outline" label="Required" value={formatMinutes(day.requiredMin)} />
                  <Row icon="hourglass-outline" label="Worked" value={day.workedMin ? formatMinutes(day.workedMin) : '—'} />
                  <Row icon="cafe-outline" label="Breaks" value={day.breakMin ? formatMinutes(day.breakMin) : '—'} />
                  <Row
                    icon="alarm-outline"
                    label="Late"
                    value={day.lateMin ? `${day.lateMin} min` : 'On time'}
                    color={day.lateMin ? colors.warning : colors.success}
                  />
                  <Row
                    icon="exit-outline"
                    label="Early exit"
                    value={day.earlyMin ? `${day.earlyMin} min` : '—'}
                    color={day.earlyMin ? colors.warning : undefined}
                  />
                  <Row icon="trending-up-outline" label="Overtime" value={day.otMin ? formatMinutes(day.otMin) : '—'} />
                  {day.remote ? <Row icon="home-outline" label="Mode" value="Remote / field" /> : null}
                  {day.segments.length > 1 ? (
                    <Row
                      icon="swap-horizontal-outline"
                      label="Sessions"
                      value={day.segments.map((s) => `${isoToTime(s.in)}–${s.out ? isoToTime(s.out) : 'now'}`).join(', ')}
                    />
                  ) : null}
                </View>
              </Card>
            ) : null}

            {!day.future ? (
              <>
                <SectionHeader title={`Punches · ${day.punches.length}`} />
                {day.punches.length ? (
                  <Card>
                    <PunchList punches={day.punches} />
                  </Card>
                ) : (
                  <EmptyState
                    icon="scan-outline"
                    title="No punches"
                    message={day.dayType === 'WORK' && !day.leave ? 'No terminal saw you this day.' : 'Nothing expected on a day off.'}
                  />
                )}
              </>
            ) : null}

            {day.requests.length ? (
              <>
                <SectionHeader title="Requests for this day" />
                {day.requests.map((r) => (
                  <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}`)} />
                ))}
              </>
            ) : null}

            {canCorrect ? (
              <Button
                label="Request a correction"
                icon="create-outline"
                variant={day.missedPunch || day.status === 'ABSENT' ? 'primary' : 'secondary'}
                onPress={() => router.push(`/request/new?kind=CORRECTION&date=${day.date}`)}
              />
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pills: { flexDirection: 'row', gap: spacing.xs },
  caption: { ...type.caption, color: colors.textFaint },
  title: { ...type.h2, color: colors.text, marginTop: spacing.sm },
});

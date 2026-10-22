/**
 * Day detail — the "Detailed In/Out" drawer (§1): status, worked segments,
 * every punch with its device / source, and any corrections. Offers a
 * correction request when the day needs one.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, EmptyState, ErrorState, Note, Row, SectionHeader, StatusPill } from '@/components/ui';
import { SkeletonDetail } from '@/components/Skeleton';
import { DayMetrics, DayTimeline, PunchList, RequestCard } from '@/components/attendance';
import { colors, spacing, type } from '@/theme';
import { getDay, toReq } from '@/lib/api';
import { formatMinutes } from '@/lib/datetime';
import { shortDay, timeLabel, todayIso } from '@/lib/format';
import { statusInfo } from '@/lib/status';
import { useScreenData } from '@/lib/useScreenData';

/** Days on which there is nothing to correct. */
const OFF_STATUSES = new Set(['WEEKLY_OFF', 'HOLIDAY', 'ON_LEAVE', 'LEAVE']);

export default function DayDetail() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { data: day, loading, error, refetch } = useScreenData(() => getDay(date), [date]);

  const isToday = date === todayIso();
  const segments = day?.segments ?? [];
  const open = segments.some((s) => !s.out);
  const closed = segments.filter((s) => s.out);
  const corrections = (day?.corrections ?? []).map((c) => toReq('CORRECTION', { workDate: date, ...c }));
  const pendingCorrection = corrections.some((c) => c.status === 'PENDING');
  const missed = !isToday && open;
  const canCorrect = !!day && date <= todayIso() && !OFF_STATUSES.has(day.status) && !pendingCorrection;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={shortDay(date)} subtitle="My attendance" />
      <Screen clearTabBar={false}>
        {loading && !day ? (
          <SkeletonDetail />
        ) : error || !day ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card>
              <View style={styles.head}>
                <Text style={styles.caption}>{isToday ? 'TODAY' : 'FINAL STATUS'}</Text>
                <StatusPill status={day.status} small />
              </View>
              <Text style={styles.title}>{day.shiftName ?? statusInfo(day.status).label}</Text>
              {segments.length ? (
                <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                  <DayTimeline date={date} spans={segments} label={day.shiftName} />
                  <DayMetrics
                    firstIn={segments[0].local?.in ?? segments[0].in}
                    lastOut={closed.length ? closed[closed.length - 1].local?.out ?? closed[closed.length - 1].out : null}
                    workedMinutes={day.workedMinutes}
                    inside={open}
                  />
                </View>
              ) : null}
            </Card>

            {missed ? (
              <Note
                icon="alert-circle-outline"
                tone="danger"
                text="A punch is missing — there's an in without an out. Request a correction so the day is counted."
              />
            ) : null}
            {segments.some((s) => s.credited) ? (
              <Note icon="create-outline" tone="brand" text="Some of this time was credited by an approved correction. The original punches are kept alongside it." />
            ) : null}

            {segments.length > 1 || day.workedMinutes ? (
              <Card>
                <View style={{ gap: spacing.md }}>
                  <Row icon="hourglass-outline" label="Worked" value={day.workedMinutes ? formatMinutes(day.workedMinutes) : '—'} />
                  {segments.length > 1 ? (
                    <Row
                      icon="swap-horizontal-outline"
                      label="Sessions"
                      value={segments
                        .map((s) => `${timeLabel(s.local?.in ?? s.in)}–${s.out ? timeLabel(s.local?.out ?? s.out) : 'now'}`)
                        .join(', ')}
                    />
                  ) : null}
                </View>
              </Card>
            ) : null}

            <SectionHeader title={`Punches · ${day.punches.length}`} />
            {day.punches.length ? (
              <Card>
                <PunchList punches={day.punches} />
              </Card>
            ) : (
              <EmptyState
                icon="scan-outline"
                title="No punches"
                message={OFF_STATUSES.has(day.status) ? 'Nothing expected on a day off.' : 'No terminal saw you this day.'}
              />
            )}

            {corrections.length ? (
              <>
                <SectionHeader title="Corrections for this day" />
                {corrections.map((r) => (
                  <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}?kind=CORRECTION`)} />
                ))}
              </>
            ) : null}

            {canCorrect ? (
              <Button
                label="Request a correction"
                icon="create-outline"
                variant={missed || day.status === 'ABSENT' ? 'primary' : 'secondary'}
                onPress={() => router.push(`/request/new?kind=CORRECTION&date=${date}`)}
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
  caption: { ...type.caption, color: colors.textFaint },
  title: { ...type.h2, color: colors.text, marginTop: spacing.sm },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

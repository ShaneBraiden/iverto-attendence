/**
 * Employee · Today — shift, live state, in/out so far, mobile punch, quick
 * requests, and what's coming up.
 */
import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { AppHeader, Screen } from '@/components/Screen';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconTile,
  Note,
  PoweredBy,
  SectionHeader,
  StatCard,
  StatusPill,
} from '@/components/ui';
import { Stagger, LiveDot } from '@/components/motion';
import { SkeletonCard, SkeletonDetailRows, SkeletonList, SkeletonStats } from '@/components/Skeleton';
import { DayMetrics, DayTimeline, RequestCard } from '@/components/attendance';
import { timeGreeting } from '@/constants/greeting';
import { colors, spacing, type } from '@/theme';
import {
  ApiError,
  createPunch,
  getAllMyRequests,
  getLeaveBalances,
  getMonth,
  getNotifications,
  getToday,
  messageOf,
  newIdempotencyKey,
  RequestKind,
} from '@/lib/api';
import { useMe } from '@/lib/auth';
import { pairPunches } from '@/lib/attendance';
import { formatMinutes, isoToTime } from '@/lib/datetime';
import { monthKey, shiftTimes, shortDay, timeLabel, todayIso } from '@/lib/format';
import { myRequestKinds } from '@/lib/requests';
import { statusInfo } from '@/lib/status';
import { useScreenData } from '@/lib/useScreenData';

/** Statuses that mean there is no shift to punch for, whatever the roster says. */
const OFF_TODAY = new Set(['ON_LEAVE', 'LEAVE', 'HOLIDAY', 'WEEKLY_OFF']);

/** Secondary panels degrade to "not shown" rather than failing the whole screen. */
const optional = <T,>(p: Promise<T>) => p.catch(() => null);

async function load(leaveEnabled: boolean, kinds: RequestKind[]) {
  const now = new Date();
  const [today, month, balances, requests, inbox] = await Promise.all([
    getToday(),
    optional(getMonth(monthKey(now.getFullYear(), now.getMonth()))),
    leaveEnabled ? optional(getLeaveBalances(now.getFullYear())) : Promise.resolve(null),
    optional(getAllMyRequests(20, kinds)),
    optional(getNotifications(null, 1)),
  ]);
  const t = todayIso();
  const balance =
    balances?.balances.find((b) => b.leaveType.code === 'CL') ?? balances?.balances[0] ?? null;
  return {
    today,
    totals: month?.totals ?? null,
    missed: month ? month.days.filter((d) => d.missedPunch && d.date < t).length : 0,
    balance,
    pending: (requests ?? []).filter((r) => r.status === 'PENDING'),
    unread: inbox?.unreadCount,
  };
}

/** Location was refused with "don't ask again" — only the settings screen can undo it. */
class LocationBlocked extends Error {}

/** A GPS fix, or a sentence saying why there isn't one. */
async function currentFix() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    if (!perm.canAskAgain) {
      throw new LocationBlocked('Location is turned off for this app. Allow it in Settings to punch from the app.');
    }
    throw new Error('Location access is needed to punch from the app. Allow it when your phone asks.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Turn on location (GPS) to punch from the app.');
  }
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Couldn't get a GPS fix. Move into the open and try again.")), 20_000),
  );
  return Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeout]);
}

export default function EmployeeToday() {
  const me = useMe();
  const emp = me.employee;
  const { data, loading, error, refetch } = useScreenData(() => load(me.features?.leave !== false, myRequestKinds(me)));
  const [punching, setPunching] = useState(false);
  const [justPunched, setJustPunched] = useState<string | null>(null);
  const [punchError, setPunchError] = useState<string | null>(null);
  const [locationBlocked, setLocationBlocked] = useState(false);
  /* Reused if the person retries the same punch after a dropped connection,
     so the server records it once (§1, Idempotency-Key). */
  const punchKey = useRef<{ direction: 'in' | 'out'; key: string } | null>(null);

  const today = data?.today;
  const day = today?.day ?? null;
  const { spans, inside } = pairPunches(today?.punches ?? []);
  const live = day ? statusInfo(day.status) : null;
  const working =
    !!day && !OFF_TODAY.has(day.status) && (day.dayType === 'WORKING' || !!day.shift || !!day.local?.schedStart);

  const doPunch = async () => {
    const direction = inside ? 'out' : 'in';
    setPunching(true);
    setPunchError(null);
    setLocationBlocked(false);
    setJustPunched(null);
    try {
      const fix = await currentFix();
      if (punchKey.current?.direction !== direction) punchKey.current = { direction, key: newIdempotencyKey() };
      const res = await createPunch(
        {
          direction,
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracy: fix.coords.accuracy ?? null,
          isMockLocation: !!fix.mocked,
          clientTime: new Date().toISOString(),
        },
        punchKey.current.key,
      );
      punchKey.current = null;
      const out = (res.direction ?? direction).toLowerCase() === 'out';
      setJustPunched(`${out ? 'Checked out' : 'Checked in'} at ${isoToTime(res.punchedAt)} · location recorded`);
      refetch();
    } catch (e) {
      /* A refusal is final for this attempt; a fresh key goes with the next one.
         An attempt still in flight, a rate limit or a server error may yet have
         been recorded, so the retry keeps the key and the server dedupes it. */
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 429 &&
        e.code !== 'IDEMPOTENCY_IN_PROGRESS'
      ) {
        punchKey.current = null;
      }
      setLocationBlocked(e instanceof LocationBlocked);
      setPunchError(messageOf(e, 'The punch was not recorded. Please try again.'));
    } finally {
      setPunching(false);
    }
  };

  const quick = (
    [
      me.features?.leave !== false && (['LEAVE', 'Apply leave', 'airplane-outline'] as const),
      ['CORRECTION', 'Fix a punch', 'create-outline'] as const,
      me.features?.remoteWork && (['REMOTE', 'Work remote', 'home-outline'] as const),
    ] as const
  ).filter(Boolean) as (readonly ['LEAVE' | 'CORRECTION' | 'REMOTE', string, 'airplane-outline' | 'create-outline' | 'home-outline'])[];

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting={timeGreeting()}
        title="Employee"
        meta={emp ? `${emp.fullName} · ${emp.employeeCode}` : me.displayName}
        icon="person-outline"
        badgeCount={data?.unread}
        onBell={() => router.push('/notifications')}
      />
      <Screen>
        {loading && !data ? (
          <>
            <SkeletonCard>
              <SkeletonDetailRows count={4} />
            </SkeletonCard>
            <SkeletonStats />
            <SkeletonList count={2} />
          </>
        ) : error || !data || !today ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card onPress={day ? () => router.push(`/day/${day.workDate}`) : undefined}>
              <View style={styles.headRow}>
                <Text style={styles.caption}>TODAY · {shortDay(day?.workDate ?? todayIso()).toUpperCase()}</Text>
                {day && live ? (
                  <View style={styles.liveRow}>
                    {inside ? <LiveDot color={colors.success} /> : null}
                    <StatusPill status={day.status} small />
                  </View>
                ) : null}
              </View>
              {day && working ? (
                <>
                  <Text style={styles.title}>
                    {day.shift?.name ?? day.shiftName ?? 'Shift'}
                    {shiftTimes(day.local?.schedStart, day.local?.schedEnd) ? ` · ${shiftTimes(day.local.schedStart, day.local.schedEnd)}` : ''}
                  </Text>
                  <Text style={styles.sub}>
                    {spans.length
                      ? inside
                        ? `Inside since ${isoToTime(spans[spans.length - 1].in)} · ${formatMinutes(day.workedMinutes)} worked so far`
                        : `Last out ${timeLabel(day.local?.lastOut ?? day.lastOut)} · ${formatMinutes(day.workedMinutes)} worked`
                      : today.mobilePunch?.allowedNow
                        ? 'Check in below, or at the terminal at the gate.'
                        : 'Look at the terminal at the gate to punch in.'}
                  </Text>
                  <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                    <DayTimeline
                      date={day.workDate}
                      schedStart={day.local?.schedStart}
                      schedEnd={day.local?.schedEnd}
                      spans={spans}
                      label={day.shift?.name ?? day.shiftName}
                    />
                    <DayMetrics
                      firstIn={day.local?.firstIn ?? day.firstIn}
                      lastOut={day.local?.lastOut ?? day.lastOut}
                      workedMinutes={day.workedMinutes}
                      late={day.isLate}
                      inside={inside}
                    />
                  </View>
                </>
              ) : (
                <Text style={styles.title}>
                  {day ? `${statusInfo(day.status).label} — enjoy the day` : 'No shift scheduled today'}
                </Text>
              )}
            </Card>

            {day?.isLate ? (
              <Note
                icon="alarm-outline"
                tone="warning"
                text={`You were marked late today${day.local?.firstIn && day.local?.schedStart ? ` — in at ${timeLabel(day.local.firstIn)}, shift starts ${timeLabel(day.local.schedStart)}` : ''}.`}
              />
            ) : null}

            {today.mobilePunch?.allowedNow ? (
              <Card>
                <View style={styles.punchRow}>
                  <IconTile icon="location-outline" size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Field check-{inside ? 'out' : 'in'}</Text>
                    <Text style={styles.sub}>
                      You can punch from the app. Server time is used; your location is saved for audit.
                    </Text>
                  </View>
                </View>
                <Button
                  label={inside ? 'Check out here' : 'Check in here'}
                  icon={inside ? 'log-out-outline' : 'log-in-outline'}
                  variant={inside ? 'secondary' : 'primary'}
                  loading={punching}
                  /* Until the refetch after a punch lands, the label still shows
                     the old direction — a second tap would send it again. */
                  disabled={loading}
                  onPress={doPunch}
                  style={{ marginTop: spacing.lg }}
                />
                {justPunched ? <Text style={styles.done}>✓ {justPunched}</Text> : null}
                {punchError ? (
                  <View style={{ marginTop: spacing.md }}>
                    <Note icon="alert-circle-outline" tone="danger" text={punchError} />
                    {locationBlocked ? (
                      <Button
                        label="Open settings"
                        icon="settings-outline"
                        variant="ghost"
                        onPress={() => Linking.openSettings().catch(() => {})}
                        style={{ marginTop: spacing.sm }}
                      />
                    ) : null}
                  </View>
                ) : null}
              </Card>
            ) : null}

            {data.totals || data.balance ? (
              <View style={styles.stats}>
                {data.totals ? (
                  <Stagger style={{ flex: 1 }}>
                    <StatCard
                      label="Present"
                      value={String(data.totals.present)}
                      icon="checkmark-circle-outline"
                      fg={colors.success}
                      bg={colors.successBg}
                      onPress={() => router.push('/employee/attendance')}
                    />
                  </Stagger>
                ) : null}
                {data.totals ? (
                  <Stagger style={{ flex: 1 }}>
                    <StatCard label="Late" value={String(data.totals.late)} icon="alarm-outline" fg={colors.warning} bg={colors.warningBg} />
                  </Stagger>
                ) : null}
                {data.balance ? (
                  <Stagger style={{ flex: 1 }}>
                    <StatCard
                      label={`${data.balance.leaveType.code} left`}
                      value={String(data.balance.available)}
                      icon="airplane-outline"
                      fg={colors.info}
                      bg={colors.infoBg}
                      onPress={() => router.push('/employee/requests')}
                    />
                  </Stagger>
                ) : null}
              </View>
            ) : null}

            {data.missed > 0 ? (
              <Card onPress={() => router.push('/employee/attendance')}>
                <View style={styles.punchRow}>
                  <IconTile icon="alert-circle-outline" tint={colors.danger} bg={colors.dangerBg} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {data.missed} missed punch{data.missed > 1 ? 'es' : ''} this month
                    </Text>
                    <Text style={styles.sub}>Open the day and request a correction.</Text>
                  </View>
                </View>
              </Card>
            ) : null}

            <SectionHeader title="Quick requests" />
            <View style={styles.quick}>
              {quick.map(([kind, label, icon]) => (
                <Stagger key={kind} style={{ flex: 1 }}>
                  <Card onPress={() => router.push(`/request/new?kind=${kind}`)}>
                    <View style={{ alignItems: 'center', gap: spacing.sm }}>
                      <IconTile icon={icon} size={40} />
                      <Text style={styles.quickLabel}>{label}</Text>
                    </View>
                  </Card>
                </Stagger>
              ))}
            </View>

            {today.nextShift ? (
              <Card onPress={() => router.push('/schedule')}>
                <View style={styles.punchRow}>
                  <IconTile icon="calendar-outline" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.caption}>NEXT SHIFT</Text>
                    <Text style={styles.cardTitle}>
                      {shortDay(today.nextShift.date)} · {today.nextShift.shift?.name ?? 'Shift'}
                    </Text>
                    {shiftTimes(today.nextShift.local?.start, today.nextShift.local?.end) ? (
                      <Text style={styles.sub}>{shiftTimes(today.nextShift.local.start, today.nextShift.local.end)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.link}>Roster</Text>
                </View>
              </Card>
            ) : null}

            <SectionHeader
              title="Awaiting approval"
              actionLabel={data.pending.length ? 'All requests' : undefined}
              onAction={() => router.push('/employee/requests')}
            />
            {data.pending.length ? (
              data.pending.slice(0, 2).map((r) => (
                <RequestCard key={`${r.kind}:${r.id}`} request={r} onPress={() => router.push(`/request/${r.id}?kind=${r.kind}`)} />
              ))
            ) : (
              <EmptyState icon="checkmark-done-outline" title="Nothing pending" message="Your leave, remote and correction requests will show here." />
            )}
          </>
        )}
        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  caption: { ...type.caption, color: colors.textFaint },
  title: { ...type.h2, color: colors.text, marginTop: spacing.sm },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  cardTitle: { ...type.bodyMed, color: colors.text },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  done: { ...type.smallMed, color: colors.success, marginTop: spacing.md, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  quick: { flexDirection: 'row', gap: spacing.sm },
  quickLabel: { ...type.smallMed, color: colors.text, textAlign: 'center' },
  link: { ...type.smallMed, color: colors.primary },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

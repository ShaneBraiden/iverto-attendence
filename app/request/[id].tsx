/**
 * Request detail — leave, correction or remote work. Opened with `?kind=`
 * because ids are only unique within a kind. The employee can withdraw leave;
 * a manager (opened with `?role=manager`) can approve or reject.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, ErrorState, Field, IconTile, Note, Row, StatusPill } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SkeletonDetail } from '@/components/Skeleton';
import { colors, spacing, type } from '@/theme';
import { ApiError, cachedRequest, cancelLeave, decide, findRequest, messageOf, newIdempotencyKey, Req } from '@/lib/api';
import { canApprove, useMe } from '@/lib/auth';
import { isoToDateTime } from '@/lib/datetime';
import { daysLabel, rangeLabel, shortDay, timeLabel, todayIso } from '@/lib/format';
import { canCancel, halfLabel, isKind, KIND_ICON, KIND_LABEL, requestDays, requestTitle } from '@/lib/requests';
import { useScreenData } from '@/lib/useScreenData';

type IconName = React.ComponentProps<typeof IconTile>['icon'];
type Decision = 'approve' | 'reject';

export default function RequestDetail() {
  const me = useMe();
  const { id, kind: rawKind, role } = useLocalSearchParams<{ id: string; kind?: string; role?: string }>();
  const kind = isKind(rawKind) ? rawKind : 'LEAVE';
  const asManager = role === 'manager' && canApprove(me);
  const [local, setLocal] = useState<Req | null>(null);
  const { data, loading, error, refetch } = useScreenData(
    () => findRequest(kind, id, asManager).then((r) => (setLocal(null), r)),
    [kind, id, asManager],
  );
  /* What a mutation returned beats what the list said, until the next read;
     the copy the app already saw fills in while loading or offline. */
  const r = local ?? data ?? cachedRequest(kind, id);

  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const decideKey = useRef<{ sig: string; key: string } | null>(null);
  const cancelKey = useRef<string | null>(null);

  const decideNow = async () => {
    if (!r || !decision) return;
    const sig = `${decision}:${note.trim()}`;
    if (decideKey.current?.sig !== sig) decideKey.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setActionError(null);
    try {
      setLocal(await decide(r.kind, r.id, decision, note, decideKey.current.key));
      setDecision(null);
    } catch (e) {
      setActionError(messageOf(e, 'That decision was not saved.'));
    } finally {
      setBusy(false);
    }
  };

  const cancelNow = async () => {
    if (!r) return;
    setBusy(true);
    setActionError(null);
    /* Same key across retries of this cancel, so a timed-out first try that
       did land is not answered with "already cancelled". */
    if (!cancelKey.current) cancelKey.current = newIdempotencyKey();
    try {
      setLocal(await cancelLeave(r.id, 'Cancelled from the app', cancelKey.current));
      setConfirmCancel(false);
    } catch (e) {
      setActionError(messageOf(e, 'The request was not cancelled.'));
    } finally {
      setBusy(false);
    }
  };

  const days = r ? requestDays(r) : null;
  const half = r ? halfLabel(r) : null;
  const approverName = me.employee?.manager?.fullName ?? 'your manager';

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={r ? `${KIND_LABEL[r.kind]} request` : 'Request'}
        subtitle={asManager && r?.employee ? r.employee.fullName : undefined}
      />
      <Screen clearTabBar={false}>
        {!r && loading ? (
          <SkeletonDetail />
        ) : !r ? (
          <ErrorState error={error ?? new ApiError('That request no longer exists.', 404)} onRetry={refetch} />
        ) : (
          <>
            <Card>
              <View style={styles.head}>
                <IconTile icon={KIND_ICON[r.kind] as IconName} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.caption}>{KIND_LABEL[r.kind].toUpperCase()}</Text>
                  <Text style={styles.title}>{requestTitle(r)}</Text>
                </View>
                <StatusPill status={r.status} />
              </View>
            </Card>

            <Card>
              <View style={{ gap: spacing.md }}>
                {asManager && r.employee ? (
                  <Row
                    icon="person-outline"
                    label="Employee"
                    value={`${r.employee.fullName}${r.employee.employeeCode ? ` · ${r.employee.employeeCode}` : ''}`}
                  />
                ) : null}
                {r.kind === 'CORRECTION' ? (
                  <>
                    <Row icon="calendar-outline" label="Date" value={r.from ? shortDay(r.from) : '—'} />
                    <Row icon="log-in-outline" label="In" value={timeLabel(r.inAt)} />
                    <Row icon="log-out-outline" label="Out" value={timeLabel(r.outAt)} />
                  </>
                ) : (
                  <>
                    <Row icon="calendar-outline" label="Dates" value={r.from ? rangeLabel(r.from, r.to) : '—'} />
                    {half ? <Row icon="contrast-outline" label="Half" value={half} /> : null}
                    {days != null ? (
                      <Row icon="hourglass-outline" label={r.kind === 'LEAVE' ? 'Working days' : 'Days'} value={daysLabel(days)} />
                    ) : null}
                  </>
                )}
                {r.reason ? <Row icon="chatbubble-outline" label="Reason" value={r.reason} /> : null}
                {r.createdAt ? <Row icon="send-outline" label="Applied" value={isoToDateTime(r.createdAt)} /> : null}
                {r.decidedAt && r.status !== 'PENDING' ? (
                  <Row icon="checkmark-done-outline" label="Decided" value={isoToDateTime(r.decidedAt)} />
                ) : null}
              </View>
            </Card>

            {r.decisionNote ? (
              <Note
                icon="chatbubble-ellipses-outline"
                tone={r.status === 'REJECTED' ? 'warning' : 'success'}
                text={`${asManager ? 'Your' : "Manager's"} note: ${r.decisionNote}`}
              />
            ) : null}
            {r.status === 'PENDING' && !asManager ? (
              <Note icon="time-outline" tone="info" text={`Waiting for ${approverName}. You'll get a notification when it's decided.`} />
            ) : null}
            {r.kind === 'CORRECTION' && r.status === 'APPROVED' ? (
              <Note icon="create-outline" tone="brand" text="A correction punch was added next to the original punches and the day was recomputed." />
            ) : null}
            {actionError ? <Note icon="alert-circle-outline" tone="danger" text={actionError} /> : null}

            {!asManager && r.from && (r.kind === 'CORRECTION' || (r.status === 'APPROVED' && r.from <= todayIso())) ? (
              <Button label="Open the day" icon="calendar-outline" variant="ghost" onPress={() => router.push(`/day/${r.from}`)} />
            ) : null}

            {r.status === 'PENDING' && asManager ? (
              <View style={styles.actions}>
                <Button
                  label="Reject"
                  variant="secondary"
                  icon="close"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => {
                    setNote('');
                    setActionError(null);
                    setDecision('reject');
                  }}
                />
                <Button
                  label="Approve"
                  variant="success"
                  icon="checkmark"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => {
                    setNote('');
                    setActionError(null);
                    setDecision('approve');
                  }}
                />
              </View>
            ) : null}
            {!asManager && canCancel(r) ? (
              <Button
                label={r.status === 'APPROVED' ? 'Cancel approved leave' : 'Cancel request'}
                variant="danger"
                icon="trash-outline"
                onPress={() => setConfirmCancel(true)}
              />
            ) : null}
          </>
        )}
      </Screen>

      <Sheet visible={!!decision} onClose={() => setDecision(null)} title={decision === 'approve' ? 'Approve request' : 'Reject request'}>
        <View style={{ gap: spacing.md }}>
          <Field
            label={decision === 'approve' ? 'Note (optional)' : 'Reason for rejecting'}
            icon="chatbubble-ellipses-outline"
            value={note}
            onChangeText={setNote}
            multiline
          />
          {actionError ? <Note icon="alert-circle-outline" tone="danger" text={actionError} /> : null}
          <Button
            label={decision === 'approve' ? 'Approve' : 'Reject'}
            variant={decision === 'approve' ? 'success' : 'danger'}
            loading={busy}
            disabled={decision === 'reject' && !note.trim()}
            onPress={decideNow}
          />
        </View>
      </Sheet>

      <Sheet
        visible={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this request?"
        subtitle={r?.status === 'APPROVED' ? 'The days go back to your balance' : 'Your manager will no longer see it'}
      >
        <View style={{ gap: spacing.sm }}>
          {actionError ? <Note icon="alert-circle-outline" tone="danger" text={actionError} /> : null}
          <Button label="Yes, cancel it" variant="danger" loading={busy} onPress={cancelNow} />
          <Button label="Keep it" variant="ghost" onPress={() => setConfirmCancel(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  caption: { ...type.caption, color: colors.textFaint },
  title: { ...type.h3, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.sm },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

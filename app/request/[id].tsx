/**
 * Request detail — leave, correction or remote work. The employee can cancel
 * while pending; the manager (opened with ?role=manager) can decide it.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, ErrorState, Field, IconTile, Note, Row, StatusPill } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SkeletonDetail } from '@/components/Skeleton';
import { colors, spacing, type } from '@/theme';
import { isoToDateTime } from '@/lib/datetime';
import { useScreenData } from '@/lib/useScreenData';
import {
  cancelRequest,
  clock,
  daysLabel,
  decide,
  employee,
  KIND_ICON,
  KIND_LABEL,
  leaveType,
  rangeLabel,
  requestById,
  shortDay,
  todayIso,
} from '@/lib/data';

type IconName = React.ComponentProps<typeof IconTile>['icon'];

export default function RequestDetail() {
  const { id, role } = useLocalSearchParams<{ id: string; role?: string }>();
  const asManager = role === 'manager';
  const { data: r, loading, error, refetch } = useScreenData(() => ({ ...requestById(id) }), [id]);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const act = (fn: () => void) => {
    setBusy(true);
    setTimeout(() => {
      fn();
      setBusy(false);
      setDecision(null);
      setConfirmCancel(false);
      refetch();
    }, 500);
  };

  const who = r ? employee(r.employeeId) : null;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={r ? `${KIND_LABEL[r.kind]} request` : 'Request'} subtitle={asManager && who ? who.name : undefined} />
      <Screen clearTabBar={false}>
        {loading && !r ? (
          <SkeletonDetail />
        ) : error || !r || !who ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card>
              <View style={styles.head}>
                <IconTile icon={KIND_ICON[r.kind] as IconName} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.caption}>{KIND_LABEL[r.kind].toUpperCase()}</Text>
                  <Text style={styles.title}>
                    {r.kind === 'LEAVE' ? leaveType(r.leaveType ?? 'CL').name : r.kind === 'CORRECTION' ? 'Punch correction' : 'Work remotely'}
                  </Text>
                </View>
                <StatusPill status={r.status} />
              </View>
            </Card>

            <Card>
              <View style={{ gap: spacing.md }}>
                {asManager ? <Row icon="person-outline" label="Employee" value={`${who.name} · ${who.code}`} /> : null}
                {r.kind === 'CORRECTION' ? (
                  <>
                    <Row icon="calendar-outline" label="Date" value={shortDay(r.from)} />
                    <Row icon="log-in-outline" label="Missing in" value={r.inTime != null ? clock(r.inTime) : '—'} />
                    <Row icon="log-out-outline" label="Missing out" value={r.outTime != null ? clock(r.outTime) : '—'} />
                  </>
                ) : (
                  <>
                    <Row icon="calendar-outline" label="Dates" value={rangeLabel(r.from, r.to)} />
                    {r.half ? <Row icon="contrast-outline" label="Half" value={r.half === 'FIRST' ? 'First half' : 'Second half'} /> : null}
                    <Row icon="hourglass-outline" label="Working days" value={daysLabel(r.days)} />
                  </>
                )}
                <Row icon="chatbubble-outline" label="Reason" value={r.reason} />
                <Row icon="send-outline" label="Applied" value={isoToDateTime(r.createdAt)} />
                {r.decidedAt ? <Row icon="checkmark-done-outline" label="Decided" value={`${isoToDateTime(r.decidedAt)} · Kavya Iyer`} /> : null}
              </View>
            </Card>

            {r.decisionNote ? (
              <Note icon="chatbubble-ellipses-outline" tone={r.status === 'REJECTED' ? 'warning' : 'success'} text={`Manager's note: ${r.decisionNote}`} />
            ) : null}
            {r.status === 'PENDING' && !asManager ? (
              <Note icon="time-outline" tone="info" text="Waiting for Kavya Iyer. You'll get a notification when it's decided." />
            ) : null}
            {r.kind === 'CORRECTION' && r.status === 'APPROVED' ? (
              <Note icon="create-outline" tone="brand" text="A correction punch was added next to your original punches and the day was recomputed." />
            ) : null}

            {r.kind === 'CORRECTION' || (r.status === 'APPROVED' && r.from <= todayIso()) ? (
              <Button
                label="Open the day"
                icon="calendar-outline"
                variant="ghost"
                onPress={() => router.push(`/day/${r.from}${asManager ? `?emp=${r.employeeId}` : ''}`)}
              />
            ) : null}

            {r.status === 'PENDING' && asManager ? (
              <View style={styles.actions}>
                <Button label="Reject" variant="secondary" icon="close" full={false} style={{ flex: 1 }} onPress={() => { setNote(''); setDecision('REJECTED'); }} />
                <Button label="Approve" variant="success" icon="checkmark" full={false} style={{ flex: 1 }} onPress={() => { setNote(''); setDecision('APPROVED'); }} />
              </View>
            ) : null}
            {r.status === 'PENDING' && !asManager ? (
              <Button label="Cancel request" variant="danger" icon="trash-outline" onPress={() => setConfirmCancel(true)} />
            ) : null}
          </>
        )}
      </Screen>

      <Sheet visible={!!decision} onClose={() => setDecision(null)} title={decision === 'APPROVED' ? 'Approve request' : 'Reject request'}>
        <View style={{ gap: spacing.md }}>
          <Field
            label={decision === 'APPROVED' ? 'Note (optional)' : 'Reason for rejecting'}
            icon="chatbubble-ellipses-outline"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <Button
            label={decision === 'APPROVED' ? 'Approve' : 'Reject'}
            variant={decision === 'APPROVED' ? 'success' : 'danger'}
            loading={busy}
            disabled={decision === 'REJECTED' && !note.trim()}
            onPress={() => act(() => decide(id, decision!, note))}
          />
        </View>
      </Sheet>

      <Sheet visible={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this request?" subtitle="Your manager will no longer see it">
        <View style={{ gap: spacing.sm }}>
          <Button label="Yes, cancel it" variant="danger" loading={busy} onPress={() => act(() => cancelRequest(id))} />
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

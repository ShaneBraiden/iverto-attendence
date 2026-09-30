/**
 * Manager · Approvals — team leave, correction and remote-work requests, with
 * approve / reject (optional note) in a sheet.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Chip, EmptyState, ErrorState, Field, Note, SectionHeader } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SkeletonApprovals } from '@/components/Skeleton';
import { RequestCard } from '@/components/attendance';
import { colors, spacing, type } from '@/theme';
import { useScreenData } from '@/lib/useScreenData';
import {
  approvalsFor,
  decide,
  employee,
  KIND_LABEL,
  leaveBalances,
  ME_ID,
  Request,
  RequestKind,
  requestSummary,
} from '@/lib/data';

const ME = ME_ID.manager;
type Decision = 'APPROVED' | 'REJECTED';

export default function Approvals() {
  const [kind, setKind] = useState<'ALL' | RequestKind>('ALL');
  const [showDone, setShowDone] = useState(false);
  const [active, setActive] = useState<{ request: Request; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const { data, loading, error, refetch } = useScreenData(() => approvalsFor(ME));

  const all = data ?? [];
  const pending = all.filter((r) => r.status === 'PENDING' && (kind === 'ALL' || r.kind === kind));
  const done = all.filter((r) => r.status !== 'PENDING' && (kind === 'ALL' || r.kind === kind));
  const count = (k: RequestKind) => all.filter((r) => r.status === 'PENDING' && r.kind === k).length;

  const open = (request: Request, decision: Decision) => {
    setNote('');
    setActive({ request, decision });
  };

  const confirm = () => {
    if (!active) return;
    setSaving(true);
    setTimeout(() => {
      const r = decide(active.request.id, active.decision, note);
      setFlash(`${KIND_LABEL[r.kind]} for ${employee(r.employeeId).name} ${active.decision === 'APPROVED' ? 'approved' : 'rejected'}.`);
      setSaving(false);
      setActive(null);
      refetch();
    }, 550);
  };

  const balance =
    active?.request.kind === 'LEAVE'
      ? leaveBalances(active.request.employeeId).find((b) => b.type.code === active.request.leaveType)
      : undefined;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Approvals" subtitle="Your direct reports" back={false} />
      <Screen>
        <View style={styles.chips}>
          <Chip label={`All · ${all.filter((r) => r.status === 'PENDING').length}`} selected={kind === 'ALL'} onPress={() => setKind('ALL')} />
          <Chip label={`Leave · ${count('LEAVE')}`} icon="airplane-outline" selected={kind === 'LEAVE'} onPress={() => setKind('LEAVE')} />
          <Chip label={`Corrections · ${count('CORRECTION')}`} icon="create-outline" selected={kind === 'CORRECTION'} onPress={() => setKind('CORRECTION')} />
          <Chip label={`Remote · ${count('REMOTE')}`} icon="home-outline" selected={kind === 'REMOTE'} onPress={() => setKind('REMOTE')} />
        </View>

        {flash ? <Note icon="checkmark-circle-outline" tone="success" text={flash} /> : null}

        {loading && !data ? (
          <SkeletonApprovals count={3} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            {pending.length ? (
              pending.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  employee={employee(r.employeeId)}
                  onPress={() => router.push(`/request/${r.id}?role=manager`)}
                  footer={
                    <View style={styles.actions}>
                      <Button label="Reject" variant="secondary" icon="close" full={false} style={{ flex: 1 }} onPress={() => open(r, 'REJECTED')} />
                      <Button label="Approve" variant="success" icon="checkmark" full={false} style={{ flex: 1 }} onPress={() => open(r, 'APPROVED')} />
                    </View>
                  }
                />
              ))
            ) : (
              <EmptyState icon="checkmark-done-outline" title="You're all caught up" message="New requests from your team will land here." />
            )}

            <SectionHeader
              title="Decided"
              actionLabel={showDone ? 'Hide' : `Show ${done.length}`}
              onAction={() => setShowDone(!showDone)}
            />
            {showDone
              ? done.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    employee={employee(r.employeeId)}
                    onPress={() => router.push(`/request/${r.id}?role=manager`)}
                  />
                ))
              : null}
          </>
        )}
      </Screen>

      <Sheet
        visible={!!active}
        onClose={() => setActive(null)}
        title={active?.decision === 'APPROVED' ? 'Approve request' : 'Reject request'}
        subtitle={active ? `${employee(active.request.employeeId).name} · ${KIND_LABEL[active.request.kind]}` : undefined}
      >
        {active ? (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.summary}>{requestSummary(active.request)}</Text>
            {balance ? (
              <Note
                icon="wallet-outline"
                tone={balance.available < 0 ? 'warning' : 'info'}
                text={`${balance.type.name}: ${balance.balance} in balance, ${balance.pending} pending (this request included).`}
              />
            ) : null}
            {active.request.kind === 'CORRECTION' && active.decision === 'APPROVED' ? (
              <Note icon="create-outline" tone="brand" text="Adds a correction punch next to the originals — nothing is overwritten. The day is recomputed." />
            ) : null}
            <Field
              label={active.decision === 'APPROVED' ? 'Note (optional)' : 'Reason for rejecting'}
              placeholder={active.decision === 'APPROVED' ? 'e.g. Enjoy the break' : 'e.g. Quarter close — please pick another week'}
              icon="chatbubble-ellipses-outline"
              value={note}
              onChangeText={setNote}
              multiline
            />
            <Button
              label={active.decision === 'APPROVED' ? 'Approve' : 'Reject'}
              variant={active.decision === 'APPROVED' ? 'success' : 'danger'}
              icon={active.decision === 'APPROVED' ? 'checkmark' : 'close'}
              loading={saving}
              disabled={active.decision === 'REJECTED' && !note.trim()}
              onPress={confirm}
            />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  summary: { ...type.bodyMed, color: colors.text },
});

/**
 * Manager · Approvals — the team's leave, correction and remote-work requests
 * from the unified queue (§10.3), with approve / reject in a sheet. A decided
 * request leaves the queue at once; the server excludes the caller's own.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Chip, EmptyState, ErrorState, Field, Note, SectionHeader } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SkeletonApprovals } from '@/components/Skeleton';
import { RequestCard } from '@/components/attendance';
import { colors, spacing, type } from '@/theme';
import { decide, getAllApprovals, messageOf, newIdempotencyKey, Req, RequestKind } from '@/lib/api';
import { KIND_LABEL, requestSummary } from '@/lib/requests';
import { useScreenData } from '@/lib/useScreenData';

type Decision = 'approve' | 'reject';

export default function Approvals() {
  const [kind, setKind] = useState<'ALL' | RequestKind>('ALL');
  const [active, setActive] = useState<{ request: Req; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [decided, setDecided] = useState<Req[]>([]);
  const idem = useRef<{ sig: string; key: string } | null>(null);
  const { data, loading, error, refetch, setData } = useScreenData(() => getAllApprovals(50));

  const all = data?.items ?? [];
  const inKind = (r: Req) => kind === 'ALL' || r.kind === kind;
  const pending = all.filter((r) => r.status === 'PENDING' && inKind(r));
  const done = [...decided, ...all.filter((r) => r.status !== 'PENDING' && !decided.some((d) => d.id === r.id && d.kind === r.kind))].filter(inKind);
  const count = (k: RequestKind) => all.filter((r) => r.status === 'PENDING' && r.kind === k).length;

  const open = (request: Req, decision: Decision) => {
    setNote('');
    setSheetError(null);
    setActive({ request, decision });
  };

  const confirm = async () => {
    if (!active) return;
    const { request, decision } = active;
    const sig = `${request.kind}:${request.id}:${decision}:${note.trim()}`;
    if (idem.current?.sig !== sig) idem.current = { sig, key: newIdempotencyKey() };
    setSaving(true);
    setSheetError(null);
    try {
      const updated = await decide(request.kind, request.id, decision, note, idem.current.key);
      setData((prev) => (prev ? { ...prev, items: prev.items.filter((r) => !(r.id === request.id && r.kind === request.kind)) } : prev));
      setDecided((prev) => [{ ...request, ...updated }, ...prev]);
      setFlash(
        `${KIND_LABEL[request.kind]} for ${request.employee?.fullName ?? 'team member'} ${decision === 'approve' ? 'approved' : 'rejected'}.`,
      );
      setActive(null);
    } catch (e) {
      setSheetError(messageOf(e, 'That decision was not saved.'));
    } finally {
      setSaving(false);
    }
  };

  const pendingTotal = all.filter((r) => r.status === 'PENDING').length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Approvals" subtitle="Requests from your team" back={false} />
      <Screen>
        <View style={styles.chips}>
          <Chip label={`All · ${pendingTotal}${data?.more ? '+' : ''}`} selected={kind === 'ALL'} onPress={() => setKind('ALL')} />
          <Chip label={`Leave · ${count('LEAVE')}`} icon="airplane-outline" selected={kind === 'LEAVE'} onPress={() => setKind('LEAVE')} />
          <Chip
            label={`Corrections · ${count('CORRECTION')}`}
            icon="create-outline"
            selected={kind === 'CORRECTION'}
            onPress={() => setKind('CORRECTION')}
          />
          <Chip label={`Remote · ${count('REMOTE')}`} icon="home-outline" selected={kind === 'REMOTE'} onPress={() => setKind('REMOTE')} />
        </View>

        {flash ? <Note icon="checkmark-circle-outline" tone="success" text={flash} /> : null}

        {loading && !data ? (
          <SkeletonApprovals count={3} />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            {pending.length ? (
              pending.map((r) => (
                <RequestCard
                  key={`${r.kind}:${r.id}`}
                  request={r}
                  showEmployee
                  onPress={() => router.push(`/request/${r.id}?kind=${r.kind}&role=manager`)}
                  footer={
                    <View style={styles.actions}>
                      <Button label="Reject" variant="secondary" icon="close" full={false} style={{ flex: 1 }} onPress={() => open(r, 'reject')} />
                      <Button label="Approve" variant="success" icon="checkmark" full={false} style={{ flex: 1 }} onPress={() => open(r, 'approve')} />
                    </View>
                  }
                />
              ))
            ) : (
              <EmptyState icon="checkmark-done-outline" title="You're all caught up" message="New requests from your team will land here." />
            )}

            {data?.more ? (
              <Note icon="layers-outline" tone="info" text="More requests are waiting. Decide these and the next ones will load." />
            ) : null}

            {done.length ? (
              <>
                <SectionHeader title="Decided" />
                {done.map((r) => (
                  <RequestCard
                    key={`${r.kind}:${r.id}`}
                    request={r}
                    showEmployee
                    onPress={() => router.push(`/request/${r.id}?kind=${r.kind}&role=manager`)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </Screen>

      <Sheet
        visible={!!active}
        onClose={() => setActive(null)}
        title={active?.decision === 'approve' ? 'Approve request' : 'Reject request'}
        subtitle={active ? `${active.request.employee?.fullName ?? 'Team member'} · ${KIND_LABEL[active.request.kind]}` : undefined}
      >
        {active ? (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.summary}>{requestSummary(active.request)}</Text>
            {active.request.kind === 'CORRECTION' && active.decision === 'approve' ? (
              <Note icon="create-outline" tone="brand" text="Adds a correction punch next to the originals — nothing is overwritten. The day is recomputed." />
            ) : null}
            <Field
              label={active.decision === 'approve' ? 'Note (optional)' : 'Reason for rejecting'}
              placeholder={active.decision === 'approve' ? 'e.g. Enjoy the break' : 'e.g. Quarter close — please pick another week'}
              icon="chatbubble-ellipses-outline"
              value={note}
              onChangeText={setNote}
              multiline
            />
            {sheetError ? <Note icon="alert-circle-outline" tone="danger" text={sheetError} /> : null}
            <Button
              label={active.decision === 'approve' ? 'Approve' : 'Reject'}
              variant={active.decision === 'approve' ? 'success' : 'danger'}
              icon={active.decision === 'approve' ? 'checkmark' : 'close'}
              loading={saving}
              disabled={active.decision === 'reject' && !note.trim()}
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

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

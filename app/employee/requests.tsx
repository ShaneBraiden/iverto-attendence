/**
 * Employee · Requests — leave balances, new request shortcuts, and the history
 * of leave / correction / remote-work requests.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, Chip, EmptyState, ErrorState, SectionHeader } from '@/components/ui';
import { Stagger } from '@/components/motion';
import { SkeletonList, SkeletonStats } from '@/components/Skeleton';
import { RequestCard } from '@/components/attendance';
import { colors, radius, spacing, type } from '@/theme';
import { useScreenData } from '@/lib/useScreenData';
import { leaveBalances, ME_ID, RequestKind, requestsFor, RequestStatus } from '@/lib/data';

const ME = ME_ID.employee;

const FILTERS: { key: 'ALL' | RequestStatus; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const KINDS: { key: 'ALL' | RequestKind; label: string }[] = [
  { key: 'ALL', label: 'Everything' },
  { key: 'LEAVE', label: 'Leave' },
  { key: 'CORRECTION', label: 'Corrections' },
  { key: 'REMOTE', label: 'Remote' },
];

export default function Requests() {
  const [status, setStatus] = useState<'ALL' | RequestStatus>('ALL');
  const [kind, setKind] = useState<'ALL' | RequestKind>('ALL');
  const { data, loading, error, refetch } = useScreenData(() => ({
    balances: leaveBalances(ME),
    requests: requestsFor(ME),
  }));

  const list = (data?.requests ?? []).filter(
    (r) => (status === 'ALL' || r.status === status) && (kind === 'ALL' || r.kind === kind),
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Requests" subtitle="Leave · corrections · remote work" back={false} />
      <Screen>
        {loading ? (
          <>
            <SkeletonStats count={4} columns={2} />
            <SkeletonList count={3} />
          </>
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <SectionHeader title="Leave balance · 2026–27" />
            <View style={styles.grid}>
              {data.balances.map((b) => (
                <Stagger key={b.type.code} style={styles.cell}>
                  <Card>
                    <Text style={styles.code}>{b.type.code}</Text>
                    <Text style={styles.balance}>{b.available}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {b.type.name}
                    </Text>
                    <Text style={styles.meta}>
                      {b.used} used{b.pending ? ` · ${b.pending} pending` : ''}
                    </Text>
                  </Card>
                </Stagger>
              ))}
            </View>

            <View style={styles.actions}>
              <Button label="Apply leave" icon="airplane-outline" onPress={() => router.push('/request/new?kind=LEAVE')} />
              <View style={styles.row}>
                <Button
                  label="Correction"
                  icon="create-outline"
                  variant="secondary"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => router.push('/request/new?kind=CORRECTION')}
                />
                <Button
                  label="Remote"
                  icon="home-outline"
                  variant="secondary"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => router.push('/request/new?kind=REMOTE')}
                />
              </View>
            </View>

            <SectionHeader title="History" />
            <View style={styles.chips}>
              {KINDS.map((k) => (
                <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
              ))}
            </View>
            <View style={styles.chips}>
              {FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} selected={status === f.key} onPress={() => setStatus(f.key)} />
              ))}
            </View>

            {list.length ? (
              list.map((r) => <RequestCard key={r.id} request={r} onPress={() => router.push(`/request/${r.id}`)} />)
            ) : (
              <EmptyState icon="document-text-outline" title="No requests here" message="Try another filter, or raise a new request above." />
            )}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '48.5%' },
  code: { ...type.caption, color: colors.primary },
  balance: { ...type.display, color: colors.text, marginTop: spacing.xs },
  name: { ...type.smallMed, color: colors.text },
  meta: { ...type.small, color: colors.textMuted },
  actions: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pad: { borderRadius: radius.lg },
});

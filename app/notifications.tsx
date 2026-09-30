/**
 * Notification inbox for either role (`?role=`).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Card, EmptyState, ErrorState, IconTile } from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { colors, spacing, type } from '@/theme';
import { timeAgo } from '@/lib/datetime';
import { useScreenData } from '@/lib/useScreenData';
import { markAllRead, ME_ID, notificationsFor, Role } from '@/lib/data';

type IconName = React.ComponentProps<typeof IconTile>['icon'];

export default function Notifications() {
  const { role = 'employee' } = useLocalSearchParams<{ role?: Role }>();
  const me = ME_ID[role];
  const { data, loading, error, refetch } = useScreenData(() => notificationsFor(me).map((n) => ({ ...n })), [me]);
  const unread = (data ?? []).filter((n) => !n.read).length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Notifications"
        subtitle={unread ? `${unread} unread · tap ✓ to clear` : 'All caught up'}
        rightIcon={unread ? 'checkmark-done-outline' : undefined}
        onRight={() => {
          markAllRead(me);
          refetch();
        }}
      />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonList count={4} />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length ? (
          data.map((n) => (
            <Card
              key={n.id}
              strong={!n.read}
              onPress={
                n.href
                  ? () => router.push(role === 'manager' && n.href!.startsWith('/request') ? `${n.href}?role=manager` : n.href!)
                  : undefined
              }
            >
              <View style={styles.row}>
                <IconTile icon={n.icon as IconName} />
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>
                      {n.title}
                    </Text>
                    {!n.read ? <View style={styles.dot} /> : null}
                  </View>
                  <Text style={styles.body}>{n.body}</Text>
                  <Text style={styles.time}>{timeAgo(n.at)}</Text>
                </View>
              </View>
            </Card>
          ))
        ) : (
          <EmptyState icon="notifications-off-outline" title="No notifications" message="Approvals, roster changes and reports will show up here." />
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.bodyMed, color: colors.text, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  body: { ...type.small, color: colors.textMuted, marginTop: 2 },
  time: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm },
});

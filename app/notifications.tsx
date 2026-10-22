/**
 * Notification inbox (§3.3). Cursor-paginated; tapping one marks it read and
 * opens the request it is about, and ✓ marks everything read.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Card, EmptyState, ErrorState, IconTile, LoadMore } from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { colors, spacing, type } from '@/theme';
import { getNotifications, markNotificationsRead } from '@/lib/api';
import { isManager, useMe } from '@/lib/auth';
import { timeAgo } from '@/lib/datetime';
import { notificationTarget } from '@/lib/requests';
import { useScreenData } from '@/lib/useScreenData';

type IconName = React.ComponentProps<typeof IconTile>['icon'];

function iconOf(type: string | null | undefined): IconName {
  const t = (type ?? '').toUpperCase();
  if (t.endsWith('APPROVED')) return 'checkmark-circle-outline';
  if (t.endsWith('REJECTED')) return 'close-circle-outline';
  if (t.endsWith('CANCELLED')) return 'remove-circle-outline';
  if (t.includes('DEVICE') || t.includes('TERMINAL')) return 'hardware-chip-outline';
  if (t.includes('SHIFT') || t.includes('ROSTER') || t.includes('SCHEDULE')) return 'calendar-outline';
  if (t.includes('LATE') || t.includes('MISSED') || t.includes('ABSENT')) return 'alarm-outline';
  if (t.includes('REPORT')) return 'bar-chart-outline';
  if (t.startsWith('REMOTE')) return 'home-outline';
  if (t.startsWith('CORRECTION')) return 'create-outline';
  if (t.startsWith('LEAVE')) return 'airplane-outline';
  return 'notifications-outline';
}

export default function Notifications() {
  const me = useMe();
  const manager = isManager(me);
  const { data, loading, error, refetch, setData } = useScreenData(() => getNotifications(null, 30));
  const [more, setMore] = useState(false);

  const unread = data?.unreadCount ?? 0;

  const markRead = (ids: string[] | 'all') => {
    const now = new Date().toISOString();
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
            unreadCount: ids === 'all' ? 0 : Math.max(0, prev.unreadCount - prev.items.filter((n) => ids.includes(n.id) && !n.readAt).length),
          }
        : prev,
    );
    /* Optimistic; the next focus refetch reconciles if this fails. */
    markNotificationsRead(ids).catch(() => {});
  };

  const loadMore = async () => {
    if (!data?.nextCursor) return;
    setMore(true);
    try {
      const page = await getNotifications(data.nextCursor, 30);
      setData((prev) =>
        prev ? { items: [...prev.items, ...page.items.filter((n) => !prev.items.some((p) => p.id === n.id))], unreadCount: page.unreadCount, nextCursor: page.nextCursor } : page,
      );
    } catch {
      /* The button stays; the person can try again. */
    } finally {
      setMore(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Notifications"
        subtitle={unread ? `${unread} unread · tap ✓ to clear` : 'All caught up'}
        rightIcon={unread ? 'checkmark-done-outline' : undefined}
        onRight={() => markRead('all')}
      />
      <Screen clearTabBar={false}>
        {loading && !data ? (
          <SkeletonList count={4} />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data?.items.length ? (
          <>
            {data.items.map((n) => {
              const target = notificationTarget(n, manager);
              return (
                <Card
                  key={n.id}
                  strong={!n.readAt}
                  onPress={() => {
                    if (!n.readAt) markRead([n.id]);
                    if (target) router.push(target);
                  }}
                >
                  <View style={styles.row}>
                    <IconTile icon={iconOf(n.type)} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text style={styles.title} numberOfLines={1}>
                          {n.title}
                        </Text>
                        {!n.readAt ? <View style={styles.dot} /> : null}
                      </View>
                      <Text style={styles.body}>{n.body}</Text>
                      <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
            <LoadMore hasMore={!!data.nextCursor} loading={more} onPress={loadMore} total={data.items.length} />
          </>
        ) : (
          <EmptyState icon="notifications-off-outline" title="No notifications" message="Approvals, roster changes and reminders will show up here." />
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

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

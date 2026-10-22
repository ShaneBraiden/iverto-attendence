import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';
import { canApprove, canViewTeam, useMe } from '@/lib/auth';

export default function ManagerLayout() {
  const screenOptions = useTabScreenOptions();
  const me = useMe();
  /* `href: null` hides a tab the account's `features` switch off. */
  const team = canViewTeam(me) ? undefined : null;
  const approvals = canApprove(me) ? undefined : null;
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Live', tabBarIcon: tabIcon('pulse-outline'), href: team }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarIcon: tabIcon('checkmark-done-outline'), href: approvals }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: tabIcon('people-outline'), href: team }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }} />
    </Tabs>
  );
}

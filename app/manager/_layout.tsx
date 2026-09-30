import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';

export default function ManagerLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Live', tabBarIcon: tabIcon('pulse-outline') }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarIcon: tabIcon('checkmark-done-outline') }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: tabIcon('people-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }} />
    </Tabs>
  );
}

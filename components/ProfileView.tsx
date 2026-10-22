/**
 * Profile, shared by both shells: identity and work details from
 * `/mobile/me`, shortcuts, password change, sign-out, and — for people who
 * approve — the switch between their own attendance and the manager view.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, TopBar } from '@/components/Screen';
import { Avatar, Button, Card, Divider, ListTile, Note, PoweredBy, Row } from '@/components/ui';
import { LogoWatermark } from '@/components/Logo';
import { Sheet } from '@/components/Sheet';
import { PasswordForm } from '@/components/PasswordForm';
import { colors, spacing, type } from '@/theme';
import { BRAND } from '@/constants/brand';
import { getNotifications } from '@/lib/api';
import { isManager, useAuth, useMe } from '@/lib/auth';
import { isoToDate } from '@/lib/datetime';
import { humanize } from '@/lib/format';
import { useScreenData } from '@/lib/useScreenData';

const PUNCH_POLICY: Record<string, string> = {
  ALWAYS: 'You can check in and out from the app on any working day. Your location is saved with each punch.',
  REMOTE_DAYS: 'You can check in from the app on days your remote-work request is approved.',
};

export function ProfileView({ shell }: { shell: 'employee' | 'manager' }) {
  const me = useMe();
  const { signOut } = useAuth();
  const emp = me.employee;
  const manager = emp?.manager ?? null;
  const approver = isManager(me);
  const [pwOpen, setPwOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { data: inbox } = useScreenData(() => getNotifications(null, 1));

  const policy = PUNCH_POLICY[me.features?.mobilePunch ?? ''];

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Profile" back={false} />
      <LogoWatermark size={220} opacity={0.04} />
      <Screen>
        <Card>
          <View style={styles.id}>
            <Avatar size={64} icon={shell === 'manager' ? 'people-outline' : 'person-outline'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{emp?.fullName ?? me.displayName}</Text>
              {emp?.designation ? <Text style={styles.sub}>{emp.designation}</Text> : null}
              <Text style={styles.code}>
                {emp?.employeeCode ? `${emp.employeeCode} · ` : ''}
                {String(me.role).toUpperCase()}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <View style={{ gap: spacing.md }}>
            {me.organisation ? <Row icon="business-outline" label="Organisation" value={me.organisation.name} /> : null}
            {emp?.department ? <Row icon="git-branch-outline" label="Department" value={emp.department.name} /> : null}
            {emp?.site ? <Row icon="location-outline" label="Site" value={emp.site.name} /> : null}
            {emp?.site?.timezone ? <Row icon="globe-outline" label="Timezone" value={emp.site.timezone} /> : null}
            {manager ? <Row icon="person-circle-outline" label="Reports to" value={manager.fullName} /> : null}
            {emp?.joinedOn ? <Row icon="calendar-number-outline" label="Joined" value={isoToDate(emp.joinedOn)} /> : null}
            <Row icon="mail-outline" label="Email" value={me.email} />
          </View>
        </Card>

        {policy ? <Note icon="phone-portrait-outline" tone="info" text={policy} /> : null}

        <Card padded={false}>
          <ListTile icon="calendar-outline" title="My roster" subtitle="Shifts for the next 14 days" onPress={() => router.push('/schedule')} />
          <Divider inset={60} />
          <ListTile
            icon="sunny-outline"
            title="Holidays"
            subtitle={emp?.site ? `${emp.site.name} calendar` : 'Holiday calendar'}
            onPress={() => router.push('/holidays')}
          />
          <Divider inset={60} />
          <ListTile
            icon="notifications-outline"
            title="Notifications"
            subtitle={inbox ? (inbox.unreadCount ? `${inbox.unreadCount} unread` : 'All caught up') : undefined}
            onPress={() => router.push('/notifications')}
          />
          {manager?.phone ? (
            <>
              <Divider inset={60} />
              <ListTile
                icon="call-outline"
                title={`Call ${manager.fullName.split(' ')[0]}`}
                subtitle={manager.phone}
                onPress={() => Linking.openURL(`tel:${manager.phone!.replace(/\s/g, '')}`)}
              />
            </>
          ) : null}
          <Divider inset={60} />
          <ListTile
            icon="key-outline"
            title="Change password"
            onPress={() => {
              setSaved(false);
              setPwOpen(true);
            }}
          />
          {approver && shell === 'manager' ? (
            <>
              <Divider inset={60} />
              <ListTile
                icon="swap-horizontal-outline"
                title="My attendance"
                subtitle="Your own punches, leave and requests"
                onPress={() => router.replace('/employee')}
              />
            </>
          ) : null}
          {approver && shell === 'employee' ? (
            <>
              <Divider inset={60} />
              <ListTile
                icon="swap-horizontal-outline"
                title="Manager view"
                subtitle="Live board, approvals and team attendance"
                onPress={() => router.replace('/manager')}
              />
            </>
          ) : null}
        </Card>

        <Card padded={false}>
          <ListTile
            icon="log-out-outline"
            title={signingOut ? 'Signing out…' : 'Sign out'}
            danger
            onPress={async () => {
              if (signingOut) return;
              setSigningOut(true);
              await signOut();
            }}
          />
        </Card>

        <Text style={styles.version}>
          {BRAND.name} · v{Constants.expoConfig?.version ?? '1.0.0'}
          {me.organisation ? ` · ${me.organisation.name}` : ''}
        </Text>
        <PoweredBy />
      </Screen>

      <Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title="Change password" subtitle="At least 10 characters">
        {saved ? (
          <View style={{ gap: spacing.lg }}>
            <Note icon="checkmark-circle-outline" tone="success" text="Password updated. Use it next time you sign in." />
            <Button label="Done" onPress={() => setPwOpen(false)} />
          </View>
        ) : (
          <PasswordForm onDone={() => setSaved(true)} />
        )}
      </Sheet>
    </View>
  );
}

/** Role label for headers — "Employee", "Manager", "Hr" reads badly, so HR is spelled out. */
export function roleLabel(role: string) {
  const r = role.toUpperCase();
  return r === 'HR' ? 'HR' : humanize(r);
}

const styles = StyleSheet.create({
  id: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { ...type.h2, color: colors.text },
  sub: { ...type.small, color: colors.textMuted },
  code: { ...type.caption, color: colors.primary, marginTop: spacing.xs },
  version: { ...type.small, color: colors.textFaint, textAlign: 'center' },
});

/**
 * Profile, shared by both role shells: identity, work details, face
 * enrolment, shortcuts, password change, and the role switch for demos.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Avatar, Button, Card, Divider, Field, ListTile, Note, PoweredBy, Row } from '@/components/ui';
import { LogoWatermark } from '@/components/Logo';
import { Sheet } from '@/components/Sheet';
import { colors, spacing, type } from '@/theme';
import { shiftLabel } from '@/lib/attendance';
import { employee, ME_ID, ORG, Role, shiftOf, teamOf, unreadCount } from '@/lib/data';

export function ProfileView({ role }: { role: Role }) {
  const me = employee(ME_ID[role]);
  const manager = me.managerId ? employee(me.managerId) : null;
  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const pwError =
    next && next.length < 10
      ? 'At least 10 characters.'
      : confirm && confirm !== next
        ? 'Passwords do not match.'
        : null;

  const savePassword = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    }, 700);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Profile" back={false} />
      <LogoWatermark size={220} opacity={0.04} />
      <Screen>
        <Card>
          <View style={styles.id}>
            <Avatar size={64} icon={role === 'manager' ? 'people-outline' : 'person-outline'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{me.name}</Text>
              <Text style={styles.sub}>{me.designation}</Text>
              <Text style={styles.code}>
                {me.code} · {role === 'manager' ? 'MANAGER' : 'EMPLOYEE'}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <View style={{ gap: spacing.md }}>
            <Row icon="business-outline" label="Organisation" value={ORG.name} />
            <Row icon="git-branch-outline" label="Department" value={me.department} />
            <Row icon="location-outline" label="Site" value={ORG.site} />
            <Row icon="globe-outline" label="Timezone" value="Asia/Kolkata" />
            <Row icon="time-outline" label="Shift" value={`${shiftOf(me).name} · ${shiftLabel(shiftOf(me))}`} />
            {manager ? <Row icon="person-circle-outline" label="Reports to" value={manager.name} /> : null}
            {role === 'manager' ? (
              <Row icon="people-outline" label="Direct reports" value={String(teamOf(me.id).length)} />
            ) : null}
            <Row icon="mail-outline" label="Email" value={me.email} />
          </View>
        </Card>

        <Note
          icon="scan-outline"
          tone="success"
          text={`Face enrolled on ${me.facesEnrolled} of 4 M50 terminals. Ask HR to re-enrol if a gate stops recognising you.`}
        />

        <Card padded={false}>
          <ListTile icon="calendar-outline" title="My roster" subtitle="Shifts for the next 14 days" onPress={() => router.push('/schedule')} />
          <Divider inset={60} />
          <ListTile icon="sunny-outline" title="Holidays" subtitle="Karnataka calendar" onPress={() => router.push('/holidays')} />
          <Divider inset={60} />
          <ListTile
            icon="notifications-outline"
            title="Notifications"
            subtitle={`${unreadCount(me.id)} unread`}
            onPress={() => router.push(`/notifications?role=${role}`)}
          />
          <Divider inset={60} />
          <ListTile icon="key-outline" title="Change password" onPress={() => { setSaved(false); setPwOpen(true); }} />
          <Divider inset={60} />
          {role === 'manager' ? (
            <ListTile
              icon="swap-horizontal-outline"
              title="Switch to employee view"
              subtitle="See the app as Aarav (demo)"
              onPress={() => router.replace('/employee')}
            />
          ) : (
            <ListTile
              icon="swap-horizontal-outline"
              title="Switch to manager view"
              subtitle="Approve your own requests as Kavya (demo)"
              onPress={() => router.replace('/manager')}
            />
          )}
        </Card>

        <Card padded={false}>
          <ListTile icon="log-out-outline" title="Sign out" danger onPress={() => router.replace('/')} />
        </Card>

        <Text style={styles.version}>Iverto Attendance · v1.0.0 · demo data</Text>
        <PoweredBy />
      </Screen>

      <Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title="Change password" subtitle="At least 10 characters">
        {saved ? (
          <View style={{ gap: spacing.lg }}>
            <Note icon="checkmark-circle-outline" tone="success" text="Password updated. Use it next time you sign in." />
            <Button label="Done" onPress={() => setPwOpen(false)} />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Field label="Current password" icon="lock-closed-outline" value={current} onChangeText={setCurrent} secureTextEntry />
            <Field label="New password" icon="key-outline" value={next} onChangeText={setNext} secureTextEntry />
            <Field
              label="Confirm new password"
              icon="key-outline"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              hint={pwError ?? undefined}
            />
            <Button
              label="Update password"
              loading={saving}
              disabled={!current || !next || next !== confirm || next.length < 10}
              onPress={savePassword}
            />
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  id: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { ...type.h2, color: colors.text },
  sub: { ...type.small, color: colors.textMuted },
  code: { ...type.caption, color: colors.primary, marginTop: spacing.xs },
  version: { ...type.small, color: colors.textFaint, textAlign: 'center' },
});

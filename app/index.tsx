/**
 * Sign-in. Accounts are created by HR (§13), so there is no sign-up — only
 * email + password and, for the demo, a role switch that pre-fills the right
 * account.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BrandLockup } from '@/components/Logo';
import { Button, Card, Chip, Field, Note, PoweredBy } from '@/components/ui';
import { Screen } from '@/components/Screen';
import { colors, spacing, type } from '@/theme';
import { employee, ME_ID, ORG, Role } from '@/lib/data';

const ROLES: { key: Role; label: string; icon: 'person-outline' | 'people-outline' }[] = [
  { key: 'employee', label: 'Employee', icon: 'person-outline' },
  { key: 'manager', label: 'Manager', icon: 'people-outline' },
];

export default function SignIn() {
  const [role, setRole] = useState<Role>('employee');
  const [email, setEmail] = useState(employee(ME_ID.employee).email);
  const [password, setPassword] = useState('••••••••••');
  const [loading, setLoading] = useState(false);

  const pick = (r: Role) => {
    setRole(r);
    setEmail(employee(ME_ID[r]).email);
  };

  const signIn = () => {
    setLoading(true);
    setTimeout(() => router.replace(`/${role}`), 650);
  };

  return (
    <Screen clearTabBar={false}>
      <View style={styles.hero}>
        <BrandLockup size={96} layout="stacked" />
        <Text style={styles.org}>{ORG.name}</Text>
      </View>

      <Card>
        <View style={{ gap: spacing.md }}>
          <Text style={styles.label}>SIGN IN AS</Text>
          <View style={styles.chips}>
            {ROLES.map((r) => (
              <Chip key={r.key} label={r.label} icon={r.icon} selected={role === r.key} onPress={() => pick(r.key)} />
            ))}
          </View>
          <Field
            label="Work email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Button label="Sign in" icon="arrow-forward" onPress={signIn} loading={loading} />
        </View>
      </Card>

      <Note
        icon="key-outline"
        tone="info"
        text="Your account is created by HR. Forgot your password? Ask HR for a new temporary one."
      />
      <PoweredBy />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxxl + spacing.xl, paddingBottom: spacing.md },
  org: { ...type.smallMed, color: colors.textMuted },
  label: { ...type.caption, color: colors.textFaint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

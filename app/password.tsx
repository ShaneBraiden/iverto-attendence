/**
 * Forced password change. HR issues a temporary password; until it is
 * replaced the API refuses everything except this and `/mobile/me` (§13), so
 * the route guards show nothing else.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { BrandLockup } from '@/components/Logo';
import { Button, Card, Note, PoweredBy } from '@/components/ui';
import { MIN_PASSWORD, PasswordForm } from '@/components/PasswordForm';
import { colors, spacing, type } from '@/theme';
import { useAuth, useMe } from '@/lib/auth';

export default function ForcedPasswordChange() {
  const me = useMe();
  const { reloadMe, signOut } = useAuth();
  const [stuck, setStuck] = useState(false);

  const done = async () => {
    /* `/me` now says mustChangePassword: false, and the guard opens the shell. */
    const fresh = await reloadMe();
    if (!fresh || fresh.mustChangePassword) setStuck(true);
  };

  return (
    <Screen clearTabBar={false}>
      <View style={styles.hero}>
        <BrandLockup size={72} layout="stacked" />
      </View>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View>
            <Text style={styles.title}>Set your own password</Text>
            <Text style={styles.sub}>
              Welcome, {me.displayName || me.email}. Replace the temporary password HR gave you — at least {MIN_PASSWORD}{' '}
              characters.
            </Text>
          </View>
          <PasswordForm onDone={done} submitLabel="Save and continue" />
        </View>
      </Card>
      {stuck ? (
        <Note
          icon="alert-circle-outline"
          tone="warning"
          text="Your password was saved, but the app could not confirm it yet. Sign in again with the new password."
        />
      ) : null}
      <Button label="Sign out" variant="ghost" icon="log-out-outline" onPress={() => void signOut()} />
      <PoweredBy />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.xxxl, paddingBottom: spacing.sm },
  title: { ...type.h2, color: colors.text },
  sub: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

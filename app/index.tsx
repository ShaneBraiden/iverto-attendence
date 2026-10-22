/**
 * Sign-in. Accounts are created by HR (§13), so there is no sign-up — only
 * email + password against Supabase Auth. Where the person lands afterwards is
 * decided by `/mobile/me` and the route guards in the root layout.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { BrandLockup } from '@/components/Logo';
import { Button, Card, Field, Note, PoweredBy } from '@/components/ui';
import { Screen } from '@/components/Screen';
import { spacing } from '@/theme';
import { AUTH_CONFIGURED, messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length > 0;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      /* The guard in the root layout moves us on; nothing to do here. */
    } catch (e) {
      setError(messageOf(e, 'Sign-in failed. Please try again.'));
      setLoading(false);
    }
  };

  return (
    <Screen clearTabBar={false}>
      <View style={styles.hero}>
        <BrandLockup size={96} layout="stacked" />
      </View>

      <Card>
        <View style={{ gap: spacing.md }}>
          <Field
            label="Work email"
            icon="mail-outline"
            placeholder="you@company.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />
          <Field
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            secureTextEntry
            autoComplete="password"
            returnKeyType="go"
            inputRef={passwordRef}
            onSubmitEditing={submit}
          />
          {error ? <Note icon="alert-circle-outline" tone="danger" text={error} /> : null}
          <Button label="Sign in" icon="arrow-forward" onPress={submit} loading={loading} disabled={!valid || !AUTH_CONFIGURED} />
        </View>
      </Card>

      {AUTH_CONFIGURED ? (
        <Note
          icon="key-outline"
          tone="info"
          text="Your account is created by HR. Forgot your password? Ask HR for a new temporary one."
        />
      ) : (
        <Note
          icon="construct-outline"
          tone="warning"
          text="This build has no sign-in server configured. Set the Supabase URL and anon key, then rebuild."
        />
      )}
      <PoweredBy />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxxl + spacing.xl, paddingBottom: spacing.md },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';

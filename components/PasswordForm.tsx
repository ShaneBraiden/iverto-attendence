/**
 * Current + new + confirm, posted to `/mobile/password`. Shared by the forced
 * first-login change and the voluntary one on Profile.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Note } from '@/components/ui';
import { spacing } from '@/theme';
import { changePassword, messageOf } from '@/lib/api';

export const MIN_PASSWORD = 10;

export function PasswordForm({ onDone, submitLabel = 'Update password' }: { onDone: () => void; submitLabel?: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hint =
    next && next.length < MIN_PASSWORD
      ? `At least ${MIN_PASSWORD} characters.`
      : next && next === current
        ? 'Pick a password different from the current one.'
        : confirm && confirm !== next
          ? 'Passwords do not match.'
          : undefined;

  const valid = !!current && next.length >= MIN_PASSWORD && next === confirm && next !== current;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone();
    } catch (e) {
      setError(messageOf(e, 'Could not update the password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Field label="Current password" icon="lock-closed-outline" value={current} onChangeText={setCurrent} secureTextEntry />
      <Field label="New password" icon="key-outline" value={next} onChangeText={setNext} secureTextEntry />
      <Field label="Confirm new password" icon="key-outline" value={confirm} onChangeText={setConfirm} secureTextEntry hint={hint} />
      {error ? <Note icon="alert-circle-outline" tone="danger" text={error} /> : null}
      <Button label={submitLabel} loading={saving} disabled={!valid} onPress={save} />
    </View>
  );
}

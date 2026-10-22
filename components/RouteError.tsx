/**
 * Error boundaries, exported as `ErrorBoundary` from route files.
 *
 * In a release build an exception thrown while rendering is fatal — Android
 * shows "app keeps stopping" and the process dies. expo-router wraps any route
 * that exports `ErrorBoundary` in a boundary, so one bad response turns into
 * this screen with a retry instead of a crash, and the rest of the app stays
 * usable. The error still goes to logcat (`ReactNativeJS`) for diagnosis.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { ErrorState } from '@/components/ui';
import { colors, spacing } from '@/theme';

const TITLE = "This screen couldn't load";
const MESSAGE = 'Something unexpected came back from the server. Try again, or go back and carry on.';

/** For any screen inside the navigator. */
export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('[ScreenErrorBoundary]', error);
  }, [error]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Something went wrong" back={router.canGoBack()} />
      <Screen clearTabBar={false}>
        <ErrorState title={TITLE} message={MESSAGE} onRetry={() => void retry()} />
      </Screen>
    </View>
  );
}

/**
 * For the root layout. It replaces the providers themselves (safe area, auth),
 * so it uses nothing that reads them — plain views on the canvas colour.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('[RootErrorBoundary]', error);
  }, [error]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>The app hit an unexpected problem. Try again to reload it.</Text>
      <Pressable onPress={() => void retry()} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  message: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  button: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.onPrimary },
});

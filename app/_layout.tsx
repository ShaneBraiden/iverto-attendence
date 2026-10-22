import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
// Imported one weight at a time. The package's root barrel `require()`s all 18
// Poppins faces, and Metro bundles every asset it sees a require for.
import { useFonts } from 'expo-font';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { colors } from '@/theme';
import { AuthProvider, isManager, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Soft colour blooms behind the glass. They give the translucent surfaces
 * something to refract, which is what makes glassmorphism read as glass
 * rather than as flat grey panels.
 */
function Canvas() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.bloom, styles.bloomTop, { backgroundColor: colors.bloomA }]} />
      <View style={[styles.bloom, styles.bloomBottom, { backgroundColor: colors.bloomB }]} />
    </View>
  );
}

/**
 * Routes, gated by the session. Signed out, only sign-in exists; with a
 * temporary password, only the forced change; otherwise the shells and every
 * detail screen. When a guard flips, expo-router drops the screens it no
 * longer allows and lands on the first one it does — which is why the manager
 * shell is listed ahead of the employee one for people who have both.
 */
function Routes() {
  const { me, ready } = useAuth();
  /* The splash stays up until the stored session has been read, so a signed-in
     person never sees the sign-in form flash past on a cold start. */
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  const signedIn = !!me && !me.mustChangePassword;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={!me}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!!me?.mustChangePassword}>
        <Stack.Screen name="password" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Protected guard={isManager(me)}>
          <Stack.Screen name="manager" />
          <Stack.Screen name="team/[id]" />
        </Stack.Protected>
        <Stack.Screen name="employee" />
        <Stack.Screen name="day/[date]" />
        <Stack.Screen name="request/new" />
        <Stack.Screen name="request/[id]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="holidays" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {/* App-wide neutral canvas — every glass surface sits on top of this. */}
        <LinearGradient colors={colors.bgGradient} style={{ flex: 1 }}>
          <Canvas />
          <AuthProvider>
            <Routes />
          </AuthProvider>
        </LinearGradient>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', width: 460, height: 460, borderRadius: 230 },
  bloomTop: { top: -190, right: -150 },
  bloomBottom: { bottom: -220, left: -170 },
});

export { RootErrorBoundary as ErrorBoundary } from '@/components/RouteError';

import React, { useCallback } from 'react';
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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const onReady = useCallback(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {/* App-wide neutral canvas — every glass surface sits on top of this. */}
        <LinearGradient colors={colors.bgGradient} style={{ flex: 1 }}>
          <Canvas />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
              animation: 'slide_from_right',
            }}
          />
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

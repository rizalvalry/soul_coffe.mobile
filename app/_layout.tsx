import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppSplash } from '@/components/brand/AppSplash';
import { useAuth } from '@/features/auth/store';
import { useOnboarding } from '@/features/onboarding/store';
import { fontFamily, semantic } from '@/theme';
import { getQueryClient } from '@/lib/queryClient';

// Global scope, not an effect: by the time a component mounts the native splash may already be
// gone, which is exactly what made the brand moment invisible (expo-splash-screen SDK 57 docs).
void SplashScreen.preventAutoHideAsync();

/**
 * The launch sequence is short but not instant — SecureStore and AsyncStorage are both native
 * round-trips. Below this, the splash would flash by too fast to read as anything but a glitch,
 * so it is held for a floor rather than shown for however long the disk happened to take.
 */
const MIN_SPLASH_MS = 1200;
const fontSources = {
  [fontFamily.medium]: PlusJakartaSans_500Medium,
  [fontFamily.bold]: PlusJakartaSans_700Bold,
  [fontFamily.extraBold]: PlusJakartaSans_800ExtraBold,
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontSources);
  const restore = useAuth((s) => s.restore);
  const authStatus = useAuth((s) => s.status);
  const sessionToken = useAuth((s) => s.session?.token);
  const loadOnboarding = useOnboarding((s) => s.load);
  const onboardingStatus = useOnboarding((s) => s.status);

  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void restore();
    void loadOnboarding();

    const timer = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [restore, loadOnboarding]);

  // A failed font load must never leave field staff behind the splash.
  const fontReady = fontsLoaded || Boolean(fontError);
  const booting = authStatus === 'restoring' || onboardingStatus === 'loading' || !minElapsed
    || !fontReady;

  // Hand the native splash over to the JS one on the first painted frame. They show the same
  // lockup on the same ground, so the seam is invisible; only the loader appears.
  const onSplashLaid = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  // Belt and braces. `preventAutoHideAsync` means the native splash stays up until something
  // hides it, so any path that skips the overlay entirely would leave the app frozen behind it —
  // the one failure mode here that a user cannot work around.
  useEffect(() => {
    if (!booting) void SplashScreen.hideAsync();
  }, [booting]);

  return (
    <QueryClientProvider key={sessionToken ?? 'signed-out'} client={getQueryClient()}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: semantic.bg },
            animation: 'fade',
          }}
        />
        {booting ? (
          <View style={StyleSheet.absoluteFill} onLayout={onSplashLaid}>
            <AppSplash />
          </View>
        ) : null}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

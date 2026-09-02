import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSplash } from '@/components/brand/AppSplash';
import { useAuth } from '@/features/auth/store';
import { useOnboarding } from '@/features/onboarding/store';
import { semantic } from '@/theme';

// Global scope, not an effect: by the time a component mounts the native splash may already be
// gone, which is exactly what made the brand moment invisible (expo-splash-screen SDK 57 docs).
void SplashScreen.preventAutoHideAsync();

/**
 * The launch sequence is short but not instant — SecureStore and AsyncStorage are both native
 * round-trips. Below this, the splash would flash by too fast to read as anything but a glitch,
 * so it is held for a floor rather than shown for however long the disk happened to take.
 */
const MIN_SPLASH_MS = 1200;

/**
 * Retry defaults are tuned for field conditions: staff work on motorbikes with intermittent
 * signal, so a transient failure should be retried rather than surfaced as an error.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0, // Writes are replayed by the offline outbox (Phase 6), not by blind retry.
    },
  },
});

export default function RootLayout() {
  const restore = useAuth((s) => s.restore);
  const authStatus = useAuth((s) => s.status);
  const loadOnboarding = useOnboarding((s) => s.load);
  const onboardingStatus = useOnboarding((s) => s.status);

  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void restore();
    void loadOnboarding();

    const timer = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [restore, loadOnboarding]);

  const booting = authStatus === 'restoring' || onboardingStatus === 'loading' || !minElapsed;

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
    <QueryClientProvider client={queryClient}>
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


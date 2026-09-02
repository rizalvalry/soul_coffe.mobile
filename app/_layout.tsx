import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/store';
import { semantic } from '@/theme';

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

  useEffect(() => {
    void restore();
  }, [restore]);

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
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

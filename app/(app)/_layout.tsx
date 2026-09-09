import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/store';
import { useLocationReporter } from '@/features/location/reporter';
import { usePushNotifications } from '@/features/push/usePushNotifications';
import { RealtimeProvider } from '@/features/realtime/RealtimeProvider';
import { DemoBanner } from '@/components/ui/DemoBanner';
import { semantic } from '@/theme';

/**
 * Authenticated area.
 *
 * This guard is a NAVIGATION convenience, not a security boundary. Every endpoint is
 * authorised server-side (docs/02 §2.1, R1). A client-side route guard protects the user
 * experience; it protects nothing else.
 */
export default function AppLayout() {
  const status = useAuth((s) => s.status);

  // Mounted here rather than in the root layout: registration needs a bearer token, and this is
  // the first point in the tree where there is guaranteed to be a session. Declared above the
  // early returns below, because a hook that runs conditionally is the one ordering violation
  // React cannot recover from.
  usePushNotifications();

  // Same reasoning, and the same ordering constraint: reporting needs a session, and it decides
  // for itself that it only applies to staff accounts. See features/location/reporter.ts for
  // what it does report and what it deliberately does not.
  useLocationReporter();

  if (status === 'restoring') return null;
  if (status === 'unauthenticated') return <Redirect href="/login" />;

  return (
    // The socket connects here, above the Stack, so it stays alive across every authenticated
    // screen instead of only the handful that used to open it themselves — see
    // RealtimeProvider's docblock for what broke while it didn't.
    <RealtimeProvider>
      <View style={{ flex: 1, backgroundColor: semantic.bg }}>
        <DemoBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: semantic.bg },
          }}
        />
      </View>
    </RealtimeProvider>
  );
}

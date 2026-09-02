import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/store';
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

  if (status === 'restoring') return null;
  if (status === 'unauthenticated') return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: semantic.bg }}>
      <DemoBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: semantic.bg },
        }}
      />
    </View>
  );
}

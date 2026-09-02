import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/store';
import { DemoBanner } from '@/components/ui/DemoBanner';

export default function AuthLayout() {
  const status = useAuth((s) => s.status);

  // An authenticated user must never see the login screen again via back navigation.
  if (status === 'authenticated') return <Redirect href="/menu" />;

  return (
    <View style={{ flex: 1 }}>
      <DemoBanner />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/store';
import { SoulLogo } from '@/components/brand/SoulLogo';
import { brand, semantic, space } from '@/theme';

/** Entry gate: hold on the splash while the stored session is read, then route by auth state. */
export default function Index() {
  const status = useAuth((s) => s.status);

  if (status === 'restoring') {
    return (
      <View style={styles.splash}>
        <SoulLogo size={120} />
        <ActivityIndicator color={brand[600]} style={styles.spinner} />
      </View>
    );
  }

  return <Redirect href={status === 'authenticated' ? '/menu' : '/login'} />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.surface,
  },
  spinner: { marginTop: space['3xl'] },
});

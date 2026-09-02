import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SoulLogo } from '@/components/brand/SoulLogo';
import { Text } from '@/components/ui/Text';
import { brand, neutral, semantic, space } from '@/theme';

/**
 * The JS half of the launch sequence.
 *
 * The native splash configured in app.json cannot show a spinner, and it disappears the instant
 * the first React frame renders — which is why the brand moment was invisible before. This
 * renders the same lockup on the same white ground, so the handoff from native to JS is seamless,
 * and adds the loader that tells a staff member on a slow device that something is happening
 * rather than that the app has hung.
 */
export function AppSplash({ message = 'Menyiapkan aplikasi...' }: { message?: string }) {
  return (
    <View style={styles.root}>
      <SoulLogo size={220} variant="lockup" showWordmark={false} />
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={brand[600]} />
        <Text variant="caption" color={semantic.textMuted} center>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutral[0],
    gap: space['4xl'],
  },
  loader: { alignItems: 'center', gap: space.md },
});

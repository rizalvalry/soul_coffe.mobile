import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from './Text';
import { feedback, radius, space } from '@/theme';
import type { ConnectionState } from '@/features/realtime/useRealtime';

export type ConnectionBannerProps = {
  state: ConnectionState;
};

/**
 * Honest indicator of which transport is actually live (docs/02 §8, §11).
 *
 * `connected` renders nothing — the socket is doing its job and a banner would just be noise.
 * `connecting` / `disconnected` renders the polling notice, because the app really has fallen
 * back to a 10s refetch loop at that point and requirement 3 (realtime) is not being met. Never
 * hide this to make the app look more "realtime" than it is.
 */
export function ConnectionBanner({ state }: ConnectionBannerProps) {
  if (state === 'connected') return null;

  return (
    <View style={styles.banner} accessibilityRole="text">
      <MaterialCommunityIcons name="cloud-off-outline" size={16} color={feedback.warningFg} />
      <Text variant="caption" color={feedback.warningFg} style={styles.text}>
        Mode luring — data diperbarui berkala
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: feedback.warningBg,
    borderColor: feedback.warningBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  text: { flex: 1 },
});

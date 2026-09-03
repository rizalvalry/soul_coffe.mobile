import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from './Text';
import { enter, exit } from './Motion';
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
 *
 * The pulsing dot on the polling notice is not decoration — it is what makes the banner read as
 * an ACTIVE fallback ("still trying") rather than a dead error message the operator learns to
 * ignore.
 */
export function ConnectionBanner({ state }: ConnectionBannerProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (state === 'connected') return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
      ),
      -1,
      false,
    );
  }, [state, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 0.85 + pulse.value * 0.35 }],
  }));

  if (state === 'connected') return null;

  return (
    <Animated.View
      entering={enter('below', 0, 8)}
      exiting={exit()}
      style={styles.banner}
      accessibilityRole="text"
    >
      <MaterialCommunityIcons name="cloud-off-outline" size={16} color={feedback.warningFg} />
      <Text variant="caption" color={feedback.warningFg} style={styles.text}>
        {state === 'connecting' ? 'Menyambungkan — data diperbarui berkala' : 'Mode luring — data diperbarui berkala'}
      </Text>
      <Animated.View style={[styles.dot, dotStyle]} />
    </Animated.View>
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
  dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: feedback.warningFg },
});

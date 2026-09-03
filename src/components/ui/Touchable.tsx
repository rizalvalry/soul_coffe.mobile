import { forwardRef, useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { pressScale, spring, timing } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TouchableProps = Omit<PressableProps, 'style'> & {
  /** How far the surface squashes on press. Use the `pressScale` tokens. */
  scaleTo?: number;
  /** Dim on press as well as squash. Off for surfaces that already darken via an overlay. */
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * The app's interactive-surface primitive.
 *
 * WHY THIS EXISTS: `Pressable`'s `({ pressed }) => …` style callback re-renders the component on
 * every touch down/up and drives feedback from the JS thread — so on a mid-range Android panel,
 * pressing a card while a list is settling gives you a feedback frame that lands after the finger
 * has already lifted. This runs the squash on the UI thread through Reanimated, so it stays
 * immediate under load — which is most of what separates an interface that feels expensive from
 * one that feels cheap.
 *
 * It also means press feedback is defined in exactly one place instead of each screen inventing
 * its own `pressed && { opacity: 0.8 }`.
 *
 * Accessibility is unchanged from `Pressable` — pass `accessibilityRole`, `accessibilityLabel`
 * and `accessibilityHint` as usual. The scale respects the system "remove animations" setting via
 * the shared spring config.
 */
export const Touchable = forwardRef<View, TouchableProps>(function Touchable(
  { scaleTo = pressScale.surface, dim = true, style, children, disabled, onPressIn, onPressOut, ...rest },
  ref,
) {
  const progress = useSharedValue(0);

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      progress.value = withSpring(1, spring.press);
      onPressIn?.(event);
    },
    [progress, onPressIn],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (event) => {
      progress.value = withSpring(0, spring.press);
      onPressOut?.(event);
    },
    [progress, onPressOut],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - progress.value * (1 - scaleTo) }],
    opacity: dim ? 1 - progress.value * 0.14 : 1,
  }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});

/**
 * Press feedback for controls that must keep their own layout style callback, or that animate
 * something other than scale. Returns a shared-value pair plus the handlers to wire up.
 */
export function usePressProgress() {
  const progress = useSharedValue(0);

  const onPressIn = useCallback(() => {
    progress.value = withSpring(1, spring.press);
  }, [progress]);

  const onPressOut = useCallback(() => {
    progress.value = withTiming(0, timing.fast);
  }, [progress]);

  return { progress, onPressIn, onPressOut };
}

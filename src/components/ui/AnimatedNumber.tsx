import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text, type TextProps } from './Text';
import { spring, timing } from '@/theme';

export type AnimatedNumberProps = Omit<TextProps, 'children'> & {
  value: number;
  /** Milliseconds for the roll. Kept short — this is feedback, not a reveal. */
  duration?: number;
  /** Rendered before the number, e.g. "Rp ". Not animated. */
  prefix?: string;
  suffix?: string;
  /** Formats the interpolated value. Defaults to `id-ID` thousands grouping. */
  format?: (value: number) => string;
};

const defaultFormat = (value: number) => value.toLocaleString('id-ID');

/**
 * A number that rolls to its new value instead of snapping.
 *
 * WHERE IT EARNS ITS KEEP: the computed total on the refill form. That total is the one figure
 * on the screen the user did not type, and §4 makes it the whole reason the screen exists — the
 * paper form's manual addition is where the errors came from. A total that visibly counts up
 * when a product quantity changes proves it is being recalculated. A total that silently shows a
 * different number leaves the user to trust that it did.
 *
 * IMPLEMENTATION NOTE: the roll is driven from JS (`requestAnimationFrame` + setState), not from
 * the UI thread. That is deliberate. Reanimated cannot animate the CONTENT of a Text node — the
 * usual workaround animates the `text` prop of an off-screen TextInput, which is fragile across
 * renderer versions and would put a non-editable TextInput in the accessibility tree. A handful
 * of setStates over 420ms on one Text node costs nothing measurable, and the surrounding pop
 * (scale) does run on the UI thread where it matters.
 *
 * Screen readers always announce the FINAL value, never an intermediate one — the interpolated
 * text is `accessibilityElementsHidden` behind a stable `accessibilityLabel`.
 */
export function AnimatedNumber({
  value,
  duration = 420,
  prefix,
  suffix,
  format = defaultFormat,
  style,
  ...textProps
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  const frame = useRef<number | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) reduceMotion.current = enabled;
    });
    return () => {
      active = false;
    };
  }, []);

  const pop = useSharedValue(0);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;

    if (from === value) return;

    pop.value = withSequence(withTiming(1, { ...timing.fast, duration: 100 }), withSpring(0, spring.bouncy));

    if (reduceMotion.current || duration <= 0) {
      setDisplay(value);
      return;
    }

    const start = Date.now();
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      // Cubic ease-out: most of the distance is covered early, so the number reads as settling
      // rather than as a slot machine winding down.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));

      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        frame.current = null;
        setDisplay(value);
      }
    };

    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [value, duration, pop]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.08 }],
  }));

  const label = `${prefix ?? ''}${format(value)}${suffix ?? ''}`;

  return (
    <Animated.View style={popStyle} accessibilityRole="text" accessibilityLabel={label}>
      <Text
        {...textProps}
        style={style as TextStyle}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {prefix}
        {format(display)}
        {suffix}
      </Text>
    </Animated.View>
  );
}

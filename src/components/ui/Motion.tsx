import type { ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  ZoomIn,
} from 'react-native-reanimated';

import { duration, easing, staggerDelay } from '@/theme';

/**
 * Screen choreography.
 *
 * The rule this file encodes: content arrives in READING ORDER, from the direction it came from,
 * and it arrives quickly. A screen where the header, the summary and the list all fade in
 * simultaneously feels like a slow screen; the same content staggered 55ms apart feels like a
 * fast one, even though the last item lands later than it would have.
 *
 * Every animation carries `ReduceMotion.System`, so Android's "Remove animations" setting turns
 * all of it off — that has to be attached per-animation, Reanimated has no global switch.
 */

export type EnterFrom = 'below' | 'above' | 'scale' | 'fade';

/** Entering animation for item `index` of a sequence. `distance` stays small (14dp default) —
 *  a 60dp slide reads as a page transition, not as one card among many settling into place. */
export function enter(from: EnterFrom = 'below', index = 0, distance = 14) {
  const delay = staggerDelay(index);

  switch (from) {
    case 'above':
      return FadeInUp.delay(delay)
        .duration(duration.slow)
        .easing(easing.decelerate)
        .withInitialValues({ transform: [{ translateY: -distance }] })
        .reduceMotion(ReduceMotion.System);

    case 'scale':
      return ZoomIn.delay(delay)
        .duration(duration.slow)
        .easing(easing.decelerate)
        .withInitialValues({ transform: [{ scale: 0.92 }] })
        .reduceMotion(ReduceMotion.System);

    case 'fade':
      return FadeIn.delay(delay).duration(duration.slow).reduceMotion(ReduceMotion.System);

    case 'below':
    default:
      return FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.decelerate)
        .withInitialValues({ transform: [{ translateY: distance }] })
        .reduceMotion(ReduceMotion.System);
  }
}

/** Exit animation. Faster than the entrance — nobody wants to wait for something to leave. */
export function exit() {
  return FadeOut.duration(duration.fast).reduceMotion(ReduceMotion.System);
}

/**
 * Layout transition for list rows added, removed or reordered by a live update. Applied to the
 * ROW: when a refill leaves a queue after a realtime event, the rows below glide up rather than
 * teleport, so the operator can see that something left instead of wondering what moved.
 */
export const listTransition = LinearTransition.duration(duration.base)
  .easing(easing.standard)
  .reduceMotion(ReduceMotion.System);

export type AppearProps = {
  children: ReactNode;
  from?: EnterFrom;
  index?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

/** Wraps content in its entering animation, for the common case of "make this block appear". */
export function Appear({ children, from = 'below', index = 0, distance, style }: AppearProps) {
  return (
    <Animated.View entering={enter(from, index, distance)} style={style}>
      {children}
    </Animated.View>
  );
}

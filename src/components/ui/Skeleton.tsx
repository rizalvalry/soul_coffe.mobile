import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Gradient } from './Gradient';
import { neutral, radius, semantic, shadow, space } from '@/theme';

/**
 * Shimmering placeholder for content that is still loading.
 *
 * WHY THIS REPLACED "Memuat…" TEXT: a line of text tells the user to wait but not what for. A
 * skeleton shaped like the thing that is coming does both — the layout does not jump when the
 * data lands, and the shape itself answers "wait for what". On the connections these users
 * actually have (patchy mobile data on a moving motorbike) that wait is routine, not exceptional.
 *
 * The sweep is measured, not percentage-based: `onLayout` gives the real pixel width, animated on
 * the UI thread. It renders a static block for one frame until that first layout arrives, rather
 * than guessing a width and snapping.
 */

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

const SWEEP_MS = 1250;

export function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  const [measured, setMeasured] = useState(0);
  const shift = useSharedValue(0);

  useEffect(() => {
    if (measured <= 0) return;

    shift.value = 0;
    shift.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
      -1,
      false,
    );
  }, [measured, shift]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== measured) setMeasured(next);
  };

  // The band is 60% of the track and travels from fully off the left edge to fully off the
  // right, so the highlight enters and leaves cleanly instead of popping at the boundaries.
  const bandWidth = measured * 0.6;
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -bandWidth + shift.value * (measured + bandWidth) }],
  }));

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.track,
        { width, height, borderRadius: borderRadius ?? (height <= 24 ? radius.pill : radius.sm) },
        style,
      ]}
    >
      {measured > 0 ? (
        <Animated.View style={[styles.band, { width: bandWidth }, sweepStyle]}>
          <Gradient colors={[neutral[200], neutral[100], neutral[200]]} direction="horizontal" bands={14} fill />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Skeleton shaped like a `RefillCard` — code line, meta row, footer. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopText}>
          <Skeleton width="52%" height={17} />
          <Skeleton width="72%" height={13} />
        </View>
        <Skeleton width={92} height={22} borderRadius={radius.pill} />
      </View>

      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i % 2 === 0 ? '88%' : '64%'} height={13} />
      ))}
    </View>
  );
}

/** A screen's worth of loading cards. Used in place of every "Memuat…" text state. */
export function SkeletonList({ count = 4, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <View style={styles.list} accessibilityRole="progressbar" accessibilityLabel="Memuat data">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </View>
  );
}

/** Skeleton shaped like the 2-up product grid on the refill form. */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.grid} accessibilityRole="progressbar" accessibilityLabel="Memuat produk">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.gridCell}>
          <Skeleton width="100%" height={140} borderRadius={radius.lg} />
          <Skeleton width="82%" height={15} />
          <Skeleton width="46%" height={13} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: neutral[200],
    overflow: 'hidden',
  },
  band: { position: 'absolute', top: 0, bottom: 0 },

  list: { gap: space.md },
  card: {
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    ...shadow.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cardTopText: { flex: 1, gap: space.sm },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridCell: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    ...shadow.card,
  },
});

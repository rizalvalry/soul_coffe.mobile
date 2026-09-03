import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
import { enter } from './Motion';
import { accent, neutral, radius, semantic, space, statusColor, type RefillStatus } from '@/theme';

/** Indonesian label for each state in the refill state machine (§6). */
export const statusLabel: Record<RefillStatus, string> = {
  SUBMITTED: 'Menunggu Approval Finance',
  APPROVED: 'Disetujui Finance',
  REJECTED: 'Ditolak',
  PREPARING: 'Sedang Disiapkan',
  READY_TO_PICK: 'Siap Diambil',
  PICKED_UP: 'Sedang Diantar',
  DELIVERED: 'Diterima Staff',
  CLOSED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  EXPIRED: 'Kedaluwarsa',
};

/**
 * States where something is actively happening somewhere else in the org, right now.
 *
 * These get a slowly pulsing dot. The pulse is not decoration: on a list of ten requests it is
 * the difference between "four of these are moving and six are parked" being visible instantly
 * versus having to read ten badges. Terminal states (CLOSED, REJECTED, CANCELLED, EXPIRED) stay
 * still, because nothing about them will change again — a pulse there would be a lie.
 */
const LIVE_STATUSES: ReadonlySet<RefillStatus> = new Set([
  'SUBMITTED',
  'APPROVED',
  'PREPARING',
  'READY_TO_PICK',
  'PICKED_UP',
]);

export function StatusBadge({ status }: { status: RefillStatus }) {
  const c = statusColor[status];
  const isLive = LIVE_STATUSES.has(status);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!isLive) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 900, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System }),
      ),
      -1,
      false,
    );
  }, [isLive, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.45 - pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 1.6 }],
  }));

  return (
    <View
      style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}
      accessibilityRole="text"
      accessibilityLabel={statusLabel[status]}
    >
      <View style={styles.dotWrap}>
        {isLive ? (
          <Animated.View style={[styles.halo, { backgroundColor: c.fg }, haloStyle]} pointerEvents="none" />
        ) : null}
        <View style={[styles.dot, { backgroundColor: c.fg }]} />
      </View>

      <Text variant="micro" color={c.fg} numberOfLines={1}>
        {statusLabel[status].toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Numeric counter for menu tiles. Caps at 99+ so the layout cannot be broken by a big number.
 *
 * Amber, not red: these counts mean "waiting for you", not "something is wrong", and a menu
 * covered in red badges every morning teaches its users to ignore red. Solid fill, no gradient —
 * a tiny 22dp circle has no room for a ramp to read as anything but a smudge.
 */
export function CountBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;

  return (
    <Animated.View
      entering={enter('scale')}
      style={[styles.count, style]}
      accessibilityRole="text"
      accessibilityLabel={`${count} item menunggu`}
    >
      <Text variant="micro" color={neutral[0]}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </Animated.View>
  );
}

/** Compact metadata pill — cart code, cup count, a location, a role chip. */
export function Chip({
  label,
  icon,
  tone = 'neutral',
  style,
}: {
  label: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'amber' | 'translucent';
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    neutral: { bg: semantic.surfaceSunken, fg: semantic.textMuted, border: 'transparent' },
    brand: { bg: '#EBF8F8', fg: semantic.primary, border: 'transparent' },
    amber: { bg: accent[50], fg: accent[600], border: 'transparent' },
    translucent: { bg: 'rgba(255,255,255,0.16)', fg: neutral[0], border: 'rgba(255,255,255,0.26)' },
  }[tone];

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }, style]}>
      {icon}
      <Text variant="captionStrong" color={palette.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  dotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  halo: { position: 'absolute', width: 7, height: 7, borderRadius: radius.pill },

  count: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: accent[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});

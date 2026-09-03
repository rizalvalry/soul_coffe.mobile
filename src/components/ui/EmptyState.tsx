import { StyleSheet, View, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Text } from './Text';
import { enter } from './Motion';
import { brand, radius, semantic, space } from '@/theme';

export type EmptyStateProps = {
  /** MaterialCommunityIcons glyph name. */
  icon: string;
  title: string;
  subtitle?: string;
  /** `danger` for load failures, `neutral` for "nothing here yet". */
  tone?: 'neutral' | 'brand' | 'danger';
  style?: ViewStyle;
  children?: React.ReactNode;
};

/**
 * Shared icon + title + subtitle block for empty lists and non-blank error/empty states.
 * No screen may render blank — this is the standard filler for "nothing here yet" / "couldn't
 * load this" so every list screen looks and reads the same way.
 *
 * The icon sits in a double ring rather than a filled square, which reads as an illustration
 * instead of a disabled button — this block appears most often on a SUCCESSFUL screen (an empty
 * approval queue means finance is caught up), and it should not look like a fault by default.
 */
export function EmptyState({ icon, title, subtitle, tone = 'brand', style, children }: EmptyStateProps) {
  const palette = {
    neutral: { ring: semantic.border, halo: semantic.surfaceSunken, fg: semantic.textMuted },
    brand: { ring: brand[100], halo: brand[50], fg: brand[600] },
    danger: { ring: '#FCA5A5', halo: '#FEE2E2', fg: '#B91C1C' },
  }[tone];

  return (
    <Animated.View entering={enter('below')} style={[styles.wrap, style]}>
      <View style={[styles.halo, { backgroundColor: palette.halo }]}>
        <View style={[styles.ring, { borderColor: palette.ring }]}>
          <MaterialCommunityIcons name={icon as never} size={28} color={palette.fg} />
        </View>
      </View>

      <Text variant="h3" center>
        {title}
      </Text>

      {subtitle ? (
        <Text variant="body" color={semantic.textMuted} center style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}

      {children ? <View style={styles.actions}>{children}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space['3xl'],
    paddingHorizontal: space.lg,
  },
  halo: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  ring: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { maxWidth: 300 },
  actions: { marginTop: space.md, alignSelf: 'stretch', gap: space.sm },
});

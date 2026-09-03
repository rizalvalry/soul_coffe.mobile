import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Text } from './Text';
import { Touchable } from './Touchable';
import { enter } from './Motion';
import { accent, brand, feedback, neutral, pressScale, radius, semantic, shadow, space, touch } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'md' | 'sm';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  /** Renders the icon after the label. For "continue"-shaped actions. */
  iconTrailing?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Accessibility hint, in Indonesian. */
  hint?: string;
};

/**
 * A flat, solid-fill pill — the reference design's "PLACE ORDER" button is one clean colour with
 * a soft shadow underneath it, nothing else. An earlier pass here rendered the fill as a banded
 * JS gradient (brand[500] → brand[900]); at 18 bands the seams between bands are faint but real,
 * and on a cheap Android panel that reads as dirt on the button rather than a sheen. Solid
 * `brand[700]` — already the AA-safe text/fill shade, see tokens.ts — reads as clean instead.
 */
const fills: Record<ButtonVariant, { fg: string; bg: string; border: string }> = {
  primary: { fg: neutral[0], bg: brand[700], border: brand[700] },
  secondary: { fg: brand[700], bg: neutral[0], border: brand[300] },
  ghost: { fg: brand[700], bg: 'transparent', border: 'transparent' },
  danger: { fg: neutral[0], bg: feedback.dangerFg, border: feedback.dangerFg },
  accent: { fg: neutral[0], bg: accent[600], border: accent[600] },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconTrailing = false,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  hint,
}: ButtonProps) {
  const isInert = disabled || loading;
  const fill = fills[variant];

  const bg = isInert && variant !== 'ghost' && variant !== 'secondary' ? semantic.primaryDisabled : fill.bg;
  const fg = isInert && variant !== 'ghost' && variant !== 'secondary' ? neutral[500] : fill.fg;
  const border = isInert && variant !== 'ghost' && variant !== 'secondary' ? semantic.primaryDisabled : fill.border;

  const iconNode = icon ? (
    <MaterialCommunityIcons name={icon as never} size={size === 'sm' ? 18 : 20} color={fg} />
  ) : null;

  return (
    <Touchable
      onPress={onPress}
      disabled={isInert}
      scaleTo={pressScale.control}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      style={[
        styles.base,
        size === 'sm' ? styles.sizeSm : styles.sizeMd,
        { backgroundColor: bg, borderColor: border },
        // A flat, light shadow only — never the heavier "raised" tier, which read as the button
        // floating a full layer above the page rather than simply sitting on it.
        !isInert && (variant === 'primary' || variant === 'accent' || variant === 'danger') ? shadow.card : null,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.content}>
          <ActivityIndicator color={fg} size="small" />
          <Text variant="bodyStrong" color={fg}>
            {label}
          </Text>
        </View>
      ) : (
        // Keyed on the label so a button whose text changes (Tolak → Konfirmasi Tolak) crossfades
        // its new content instead of swapping it in the same frame as the layout resize.
        <Animated.View key={label} entering={enter('fade')} style={styles.content}>
          {iconTrailing ? null : iconNode}
          <Text variant="bodyStrong" color={fg} numberOfLines={1}>
            {label}
          </Text>
          {iconTrailing ? iconNode : null}
        </Animated.View>
      )}
    </Touchable>
  );
}

/**
 * Circular icon-only control — back buttons, overflow, dismiss.
 *
 * Separate from `Button` rather than a variant of it because the accessible label cannot be
 * inferred from a glyph: this REQUIRES `label`, so a bare icon can never ship without one.
 */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'surface',
  size = touch.minTarget - 4,
  disabled = false,
  style,
}: {
  icon: string;
  onPress?: () => void;
  /** Accessible name. Required — an icon alone is not a label. */
  label: string;
  tone?: 'surface' | 'translucent' | 'tinted' | 'plain';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    surface: { bg: neutral[0], fg: semantic.text, border: 'transparent' },
    translucent: { bg: 'rgba(255,255,255,0.18)', fg: neutral[0], border: 'rgba(255,255,255,0.32)' },
    tinted: { bg: brand[50], fg: brand[700], border: 'transparent' },
    plain: { bg: 'transparent', fg: semantic.textMuted, border: 'transparent' },
  }[tone];

  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      scaleTo={pressScale.icon}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        tone === 'surface' ? shadow.card : null,
        disabled ? styles.iconDisabled : null,
        style,
      ]}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={Math.round(size * 0.5)}
        color={disabled ? semantic.textSubtle : palette.fg}
      />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sizeMd: { minHeight: touch.buttonHeight, paddingHorizontal: space['2xl'] },
  sizeSm: { minHeight: 40, paddingHorizontal: space.lg },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },

  iconButton: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconDisabled: { opacity: 0.5 },
});

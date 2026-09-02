import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from './Text';
import { brand, feedback, neutral, radius, semantic, space, touch } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  /** Accessibility hint, in Indonesian. */
  hint?: string;
};

/**
 * NOTE ON COLOUR: the primary fill is brand[700] (#007277), not the logo colour brand[500].
 * brand[500] only reaches 3.08:1 against white and would fail WCAG AA for the label.
 * See tokens.ts for the full rule — this is not an arbitrary shade choice.
 */
const fills: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: brand[700], fg: neutral[0], border: brand[700] },
  secondary: { bg: neutral[0], fg: brand[700], border: brand[300] },
  ghost: { bg: 'transparent', fg: brand[700], border: 'transparent' },
  danger: { bg: feedback.dangerFg, fg: neutral[0], border: feedback.dangerFg },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  hint,
}: ButtonProps) {
  const isInert = disabled || loading;
  const fill = fills[variant];

  const bg = isInert && variant === 'primary' ? semantic.primaryDisabled : fill.bg;
  const fg = isInert && variant === 'primary' ? neutral[500] : fill.fg;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: isInert && variant === 'primary' ? semantic.primaryDisabled : fill.border,
        },
        fullWidth && styles.fullWidth,
        pressed && !isInert && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <MaterialCommunityIcons name={icon as never} size={20} color={fg} /> : null}
          <Text variant="bodyStrong" color={fg}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.buttonHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.82 },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Text } from './Text';
import { enter, exit } from './Motion';
import { feedback, radius, space } from '@/theme';

export type BannerTone = 'danger' | 'warning' | 'info' | 'success';

const palette: Record<BannerTone, { fg: string; bg: string; border: string; icon: string }> = {
  danger: { fg: feedback.dangerFg, bg: feedback.dangerBg, border: feedback.dangerBorder, icon: 'alert-circle' },
  warning: { fg: feedback.warningFg, bg: feedback.warningBg, border: feedback.warningBorder, icon: 'alert' },
  info: { fg: feedback.infoFg, bg: feedback.infoBg, border: feedback.infoBorder, icon: 'information' },
  success: { fg: feedback.successFg, bg: feedback.successBg, border: feedback.successBorder, icon: 'check-circle' },
};

/**
 * Inline message block — validation failures, conflicts, offline notices.
 *
 * WHY IT IS SHARED: this exact row (icon + tinted box + coloured caption) used to be copy-pasted
 * into every screen as a local `errorBanner` style. Every copy was a chance for one screen's error
 * to look less urgent than another's, and a form error that reads as decoration is a form error
 * the user scrolls straight past.
 *
 * It animates in from below and fades out, so an error that appears after a failed submit is seen
 * as an ARRIVAL — a message that simply exists on the next render is easy to miss when the user's
 * eye is on the button they just pressed.
 */
export function Banner({
  message,
  tone = 'danger',
  icon,
  style,
  children,
}: {
  message: string;
  tone?: BannerTone;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const c = palette[tone];

  return (
    <Animated.View
      entering={enter('below', 0, 8)}
      exiting={exit()}
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }, style]}
    >
      <MaterialCommunityIcons name={(icon ?? c.icon) as never} size={18} color={c.fg} />
      <View style={styles.body}>
        <Text variant="caption" color={c.fg}>
          {message}
        </Text>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  body: { flex: 1, gap: space.xs },
});

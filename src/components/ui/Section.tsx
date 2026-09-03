import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Text } from './Text';
import { Touchable } from './Touchable';
import { brand, pressScale, semantic, space } from '@/theme';

/**
 * Section divider inside a scrolling screen.
 *
 * Replaces the loose `<Text variant="micro">MENU UTAMA</Text>` lines the screens used to place
 * by hand. Those had no consistent spacing above or below, so the gap between a section label
 * and its content varied by screen and the page lost its rhythm.
 *
 * The label is deliberately small and muted: a section header competing with the content under
 * it makes a screen feel like a form. Its job is to be findable when scanned and invisible when
 * reading.
 */
export function SectionTitle({
  title,
  caption,
  action,
  onAction,
  icon,
  style,
}: {
  title: string;
  caption?: string;
  /** Label for a trailing text action, e.g. "Lihat semua". */
  action?: string;
  onAction?: () => void;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.textBlock}>
        <View style={styles.titleRow}>
          {icon ? (
            <MaterialCommunityIcons name={icon as never} size={15} color={semantic.textSubtle} />
          ) : null}
          <Text variant="micro" color={semantic.textSubtle} style={styles.title}>
            {title.toUpperCase()}
          </Text>
        </View>
        {caption ? (
          <Text variant="caption" color={semantic.textMuted}>
            {caption}
          </Text>
        ) : null}
      </View>

      {action && onAction ? (
        <Touchable
          onPress={onAction}
          scaleTo={pressScale.control}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={styles.action}
        >
          <Text variant="captionStrong" color={brand[700]}>
            {action}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={brand[700]} />
        </Touchable>
      ) : null}
    </View>
  );
}

/** Label + value row, for the summary blocks inside a detail card. */
export function MetaRow({
  label,
  value,
  icon,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  /** Draws a rule above and weights the value. For a card's bottom-line figure. */
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.metaRow, emphasis && styles.metaRowEmphasis]}>
      <View style={styles.metaLabel}>
        {icon ? (
          <MaterialCommunityIcons name={icon as never} size={15} color={semantic.textSubtle} />
        ) : null}
        <Text variant="caption" color={semantic.textMuted}>
          {label}
        </Text>
      </View>

      {typeof value === 'string' ? (
        <Text variant={emphasis ? 'h3' : 'bodyStrong'} color={emphasis ? brand[700] : semantic.text}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.xs,
  },
  textBlock: { flex: 1, gap: space.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { letterSpacing: 1.3 },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: 28,
  },
  metaRowEmphasis: {
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.md,
    marginTop: space.xs,
  },
  metaLabel: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
});

import { StyleSheet, View, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from './Text';
import { brand, radius, semantic, space } from '@/theme';

export type EmptyStateProps = {
  /** MaterialCommunityIcons glyph name. */
  icon: string;
  title: string;
  subtitle?: string;
  style?: ViewStyle;
};

/**
 * Shared icon + title + subtitle block for empty lists and non-blank error/empty states.
 * No screen may render blank — this is the standard filler for "nothing here yet" / "couldn't
 * load this" so every list screen looks and reads the same way.
 */
export function EmptyState({ icon, title, subtitle, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon as never} size={32} color={brand[700]} />
      </View>
      <Text variant="h3" center>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color={semantic.textMuted} center>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space['3xl'],
    paddingHorizontal: space.lg,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
});

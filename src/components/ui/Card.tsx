import { StyleSheet, View, type ViewProps } from 'react-native';
import { elevation, neutral, radius, semantic, space } from '@/theme';

export type CardProps = ViewProps & {
  padded?: boolean;
  accent?: boolean;
};

export function Card({ padded = true, accent = false, style, ...rest }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        padded && styles.padded,
        accent && { borderColor: semantic.accent, borderWidth: 1.5 },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    ...elevation.sm,
  },
  padded: { padding: space.lg },
});

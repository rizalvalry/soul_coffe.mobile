import { StyleSheet, View, type ViewProps } from 'react-native';
import { brand, neutral, radius, semantic, shadow, space } from '@/theme';

export type CardProps = ViewProps & {
  padded?: boolean;
  /** Tints the surface with the brand wash — for the one card on a screen that leads. */
  accent?: boolean;
};

/**
 * The app's surface.
 *
 * Depth comes from a soft tinted shadow, not a hairline border. A 1px outline around every
 * surface reads as a form; the same card floating on the page's pale teal wash reads as a card.
 * That single swap is most of what separates the reference layout from the old one.
 */
export function Card({ padded = true, accent = false, style, ...rest }: CardProps) {
  return (
    <View style={[styles.base, padded && styles.padded, accent && styles.accent, style]} {...rest} />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    ...shadow.card,
  },
  padded: { padding: space.lg },
  // A wash plus a hairline of brand, rather than the old 1.5px ring: at this radius a thick
  // border fights the shadow and the corner starts to look doubled.
  accent: {
    backgroundColor: brand[50],
    borderWidth: 1,
    borderColor: brand[200],
  },
});

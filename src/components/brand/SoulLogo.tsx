import { Image, StyleSheet, View, type ImageStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { brand, space } from '@/theme';

/**
 * The official logo, rendered from the Figma export rather than reconstructed in code: the mark
 * has a bean, five leaves and a cup silhouette in negative space, and an approximated logo is a
 * brand defect.
 *
 * Two assets, both generated from `figma/soul.png` with its 2px grey frame cropped off and its
 * transparent background preserved. That frame is why the login header used to show a hard border
 * around the logo — it was part of the image file, so no amount of styling could remove it.
 *
 *  - `logo-mark.png`   the glyph alone, for headers and badges
 *  - `logo-lockup.png` glyph + SOUL COFFEEMATE wordmark, for the splash
 *
 * The mark is two-colour (brand teal, with white for the cup's negative space), so it needs a
 * light backdrop to read. Callers placing it on a dark surface must supply `plate`.
 */
export type SoulLogoProps = {
  size?: number;
  /** Draw the wordmark as live text beneath the glyph — stays crisp at any size, unlike a bitmap. */
  showWordmark?: boolean;
  /** Use the artwork's own wordmark instead of live text. For the splash, where the lockup is the subject. */
  variant?: 'mark' | 'lockup';
};

export function SoulLogo({ size = 96, showWordmark = true, variant = 'mark' }: SoulLogoProps) {
  const source =
    variant === 'lockup'
      ? require('../../../assets/logo-lockup.png')
      : require('../../../assets/logo-mark.png');

  // The mark is taller than it is wide; `contain` inside a square box would leave it small and
  // off-centre, so the box is sized to the artwork's own ratio and `size` means the tallest edge.
  const ratio = variant === 'lockup' ? 563 / 1024 : 349 / 512;
  const imageStyle: ImageStyle = { width: size * ratio, height: size };

  return (
    <View style={styles.wrap}>
      <Image
        source={source}
        style={imageStyle}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Logo Soul Coffeemate"
      />
      {showWordmark && variant === 'mark' ? (
        <View style={styles.wordmark}>
          <Text variant="h1" color={brand[600]} style={styles.soul}>
            SOUL
          </Text>
          <Text variant="micro" color={brand[500]} style={styles.tagline}>
            COFFEEMATE
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  wordmark: { alignItems: 'center', marginTop: space.xs },
  soul: { letterSpacing: 4 },
  tagline: { letterSpacing: 6, marginTop: space.xxs },
});

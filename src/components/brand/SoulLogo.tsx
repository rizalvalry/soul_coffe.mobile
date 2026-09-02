import { Image, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { brand, space } from '@/theme';

/**
 * The official logo asset, copied from figma/soul.png.
 *
 * Rendered as an image rather than reconstructed in code: the mark has a bean, five leaves and a
 * cup silhouette in negative space. Re-drawing that with Views would be an approximation, and an
 * approximated logo is a brand defect.
 */
export function SoulLogo({ size = 96, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../../assets/logo.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Logo Soul Coffeemate"
      />
      {showWordmark ? (
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

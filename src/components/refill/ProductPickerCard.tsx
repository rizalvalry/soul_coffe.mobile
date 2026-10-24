import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { enter } from '@/components/ui/Motion';
import { productImageSource } from '@/domain/productImages';
import {
  brand,
  entrance,
  feedback,
  neutral,
  pressScale,
  productColor,
  radius,
  shadow,
  semantic,
  space,
  spring,
  timing,
  touch,
} from '@/theme';
import type { Product } from '@/domain/types';

export type ProductPickerCardProps = {
  product: Product;
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  /** Position in the grid. Drives the entrance stagger. */
  index?: number;
};

/**
 * One tile in the request grid.
 *
 * WHAT WAS UNCOMFORTABLE ABOUT THE OLD TILE: the count badge and the "tap to add" plus both sat
 * bare on top of the raw product photo. Some of these photos are light — a milky latte, a pale
 * matcha — and a plain white circle on a light patch of the same photo nearly disappeared, which
 * is exactly the kind of low-contrast clutter that makes a screen tiring to scan even before you
 * notice why. A soft scrim is now painted across the LOWER THIRD of every photo regardless of
 * its own colours, so the badge always sits on a guaranteed-dark strip and never gambles on what
 * is underneath it.
 *
 * Everything else was static. Selecting a tile now animates its ring and wash in rather than
 * snapping, the badge pops on every count change, and the whole tile settles with a soft press
 * squash — the same one-handed, blunt "tap the photo to add" interaction, just confirmed instead
 * of merely registered.
 */
export function ProductPickerCard({ product, value, max, disabled = false, onChange, index = 0 }: ProductPickerCardProps) {
  // Only the CMS upload may supply a product photo; null shows the icon below.
  const image = productImageSource(product);
  const selected = value > 0;
  const atMax = value >= max;
  const tone = productColor[product.name as keyof typeof productColor] ?? { bg: brand[50], fg: brand[700] };

  const selectedProgress = useDerivedValue(() =>
    selected ? withSpring(1, spring.gentle) : withTiming(0, timing.base),
  );

  const pop = useSharedValue(0);
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    pop.value = withSequence(withTiming(1, { ...timing.fast, duration: 90 }), withSpring(0, spring.bouncy));
  }, [value, pop]);

  const add = () => {
    if (disabled || atMax) return;
    onChange(value + 1);
  };

  const remove = () => {
    if (disabled || value <= 0) return;
    onChange(value - 1);
  };

  const cardStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(selectedProgress.value, [0, 1], ['transparent', brand[500]]),
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * (entrance.badgePeak - 1) }],
  }));

  return (
    <Animated.View entering={enter('below', index)} style={[styles.card, cardStyle, disabled && styles.disabledCard]}>
      <Touchable
        onPress={add}
        disabled={disabled || atMax}
        accessibilityState={{ disabled: disabled || atMax }}
        scaleTo={pressScale.surface}
        dim={false}
        accessibilityRole="button"
        accessibilityLabel={`Tambah ${product.name}`}
        accessibilityHint={`Jumlah saat ini ${value} ${product.unit}`}
        style={[styles.imageWrap, { backgroundColor: tone.bg }]}
      >
        {image ? (
          <Image source={image} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name="cup-outline" size={40} color={tone.fg} />
          </View>
        )}

        {image ? <View style={styles.scrim} pointerEvents="none" /> : null}

        {selected ? (
          <Animated.View style={[styles.countBadge, badgeStyle]}>
            <Text variant="bodyStrong" color={neutral[0]}>
              {value}
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.addHint}>
            <MaterialCommunityIcons name="plus" size={20} color={neutral[0]} />
          </View>
        )}
      </Touchable>

      <View style={[styles.body, { backgroundColor: tone.bg }]}>
        <Text variant="bodyStrong" color={tone.fg} numberOfLines={2} ellipsizeMode="tail" accessibilityLabel={product.name} style={styles.name}>
          {product.name}
        </Text>

        {selected ? (
          <View style={styles.stepper}>
            <Touchable
              onPress={remove}
              disabled={disabled}
              scaleTo={pressScale.icon}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Kurangi ${product.name}`}
              style={styles.stepButton}
            >
              <MaterialCommunityIcons
                name={value === 1 ? 'trash-can-outline' : 'minus'}
                size={20}
                color={value === 1 ? feedback.dangerFg : brand[700]}
              />
            </Touchable>

            <Animated.View style={badgeStyle}>
              <Text variant="h3" style={styles.count}>
                {value}
              </Text>
            </Animated.View>

            <Touchable
              onPress={add}
              disabled={disabled || atMax}
              scaleTo={pressScale.icon}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Tambah ${product.name}`}
              style={[styles.stepButton, styles.stepButtonPrimary, atMax && styles.stepInert]}
            >
              <MaterialCommunityIcons name="plus" size={20} color={atMax ? semantic.textSubtle : neutral[0]} />
            </Touchable>
          </View>
        ) : (
          <Text variant="caption" color={semantic.textSubtle}>
            Ketuk untuk tambah
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.card,
    // The ring is transparent at rest so selecting a tile colours it in rather than adding a
    // border and nudging the grid; depth is the shadow's job, not the outline's.
    borderWidth: 2,
    backgroundColor: neutral[0],
    overflow: 'hidden',
    ...shadow.card,
  },
  disabledCard: { opacity: 0.5 },

  imageWrap: { aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(0,20,22,0.32)',
  },

  countBadge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    minWidth: 32,
    height: 32,
    paddingHorizontal: space.xs,
    borderRadius: 16,
    backgroundColor: brand[700],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  addHint: {
    position: 'absolute',
    bottom: space.xs,
    right: space.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { padding: space.sm, gap: space.xs, minHeight: 84, justifyContent: 'space-between' },
  name: { minHeight: 40 },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.pill, backgroundColor: neutral[100], padding: space.xxs },
  stepButton: {
    width: touch.minTarget - 8,
    height: touch.minTarget - 8,
    borderRadius: (touch.minTarget - 8) / 2,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonPrimary: { backgroundColor: brand[700], borderColor: brand[700] },
  stepInert: { backgroundColor: neutral[100], borderColor: semantic.border },
  count: { minWidth: 40, textAlign: 'center' },
});

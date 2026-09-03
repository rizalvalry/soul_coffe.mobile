import { Image, Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from '@/components/ui/Text';
import { productImage } from '@/domain/productImages';
import { brand, feedback, neutral, radius, shadow, semantic, space, touch } from '@/theme';
import type { Product } from '@/domain/types';

export type ProductPickerCardProps = {
  product: Product;
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
};

/**
 * One tile in the request grid.
 *
 * The interaction is deliberately blunt: tapping the photo adds one cup, and the minus button
 * only exists once there is something to remove. Staff use this one-handed, outdoors, often with
 * the phone in the same hand that is holding something else — hunting for a small stepper on
 * every row is what made the old list tedious. The photo is the target because it is the largest
 * thing on the tile and the thing they are actually looking at.
 */
export function ProductPickerCard({
  product,
  value,
  max,
  disabled = false,
  onChange,
}: ProductPickerCardProps) {
  const image = productImage(product.code);
  const selected = value > 0;
  const atMax = value >= max;

  const add = () => {
    if (disabled || atMax) return;
    onChange(value + 1);
  };

  const remove = () => {
    if (disabled || value <= 0) return;
    onChange(value - 1);
  };

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <Pressable
        onPress={add}
        disabled={disabled || atMax}
        accessibilityRole="button"
        accessibilityLabel={`Tambah ${product.name}`}
        accessibilityHint={`Jumlah saat ini ${value} ${product.unit}`}
        style={({ pressed }) => [styles.imageWrap, pressed && styles.pressed]}
      >
        {image ? (
          <Image source={image} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name="cup-outline" size={40} color={brand[400]} />
          </View>
        )}

        {selected ? (
          <View style={styles.countBadge}>
            <Text variant="bodyStrong" color={neutral[0]}>
              {value}
            </Text>
          </View>
        ) : (
          <View style={styles.addHint}>
            <MaterialCommunityIcons name="plus" size={20} color={neutral[0]} />
          </View>
        )}
      </Pressable>

      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>

        {selected ? (
          <View style={styles.stepper}>
            <Pressable
              onPress={remove}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Kurangi ${product.name}`}
              style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name={value === 1 ? 'trash-can-outline' : 'minus'}
                size={20}
                color={value === 1 ? feedback.dangerFg : brand[700]}
              />
            </Pressable>

            <Text variant="h3" style={styles.count}>
              {value}
            </Text>

            <Pressable
              onPress={add}
              disabled={disabled || atMax}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Tambah ${product.name}`}
              style={({ pressed }) => [
                styles.stepButton,
                styles.stepButtonPrimary,
                atMax && styles.stepInert,
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name="plus"
                size={20}
                color={atMax ? semantic.textSubtle : neutral[0]}
              />
            </Pressable>
          </View>
        ) : (
          <Text variant="caption" color={semantic.textSubtle}>
            Ketuk untuk tambah
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    // The ring is transparent at rest so selecting a tile colours it in rather than adding a
    // border and nudging the grid; depth is the shadow's job, not the outline's.
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: neutral[0],
    overflow: 'hidden',
    ...shadow.card,
  },
  cardSelected: { borderColor: brand[500] },

  imageWrap: { aspectRatio: 1, backgroundColor: brand[50] },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand[50],
  },
  pressed: { opacity: 0.75 },

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
    opacity: 0.92,
  },

  body: { padding: space.sm, gap: space.xs, minHeight: 78, justifyContent: 'space-between' },
  name: { minHeight: 36 },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepButton: {
    width: touch.minTarget - 8,
    height: touch.minTarget - 8,
    borderRadius: (touch.minTarget - 8) / 2,
    borderWidth: 1,
    borderColor: brand[200],
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonPrimary: { backgroundColor: brand[600], borderColor: brand[600] },
  stepInert: { backgroundColor: neutral[100], borderColor: semantic.border },
  count: { minWidth: 40, textAlign: 'center' },
});

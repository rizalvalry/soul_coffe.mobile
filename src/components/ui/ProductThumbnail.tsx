import { Image, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { productImageSource } from '@/domain/productImages';
import { brand, neutral, productColor, radius } from '@/theme';

type Props = { product: { image_url?: string | null; name?: string; product_name?: string }; size?: number };

/** React Native caches remote images by URL; each CMS replacement gets a new filename. */
export function ProductThumbnail({ product, size = 40 }: Props) {
  const image = productImageSource(product);
  const name = product.name ?? product.product_name ?? '';
  const tone = productColor[name as keyof typeof productColor] ?? { bg: neutral[100], fg: brand[700] };

  return (
    <View style={[styles.frame, { width: size, height: size, backgroundColor: tone.bg }]}>
      {image ? (
        <Image key={product.image_url} source={image} style={styles.image} resizeMode="cover" />
      ) : (
        <MaterialCommunityIcons name="cup-outline" size={22} color={tone.fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
});

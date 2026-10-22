import { Image, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { productImageSource } from '@/domain/productImages';
import { brand, radius } from '@/theme';

type Props = { product: { image_url?: string | null }; size?: number };

/** React Native caches remote images by URL; each CMS replacement gets a new filename. */
export function ProductThumbnail({ product, size = 40 }: Props) {
  const image = productImageSource(product);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {image ? (
        <Image key={product.image_url} source={image} style={styles.image} resizeMode="cover" />
      ) : (
        <MaterialCommunityIcons name="cup-outline" size={22} color={brand[400]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.sm,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
});

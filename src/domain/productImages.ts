import type { ImageSourcePropType } from 'react-native';

/** CMS replacement uploads receive new filenames, so their URL is the image cache key. */
export function productImageSource(product: { image_url?: string | null }): ImageSourcePropType | null {
  const url = product.image_url?.trim();
  if (!url) return null;
  return { uri: url };
}

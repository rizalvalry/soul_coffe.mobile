import type { ImageSourcePropType } from 'react-native';

/**
 * Product photography for the request grid, sliced from `figma/soul_menu.jpg`.
 *
 * Keyed by the product's `code` rather than its name: codes are stable identifiers owned by the
 * database, whereas names are copy and get edited. A product with no photo is not an error — the
 * grid falls back to an icon tile — so this map is allowed to be incomplete, and is, for
 * `PASSION-COLDBREW` (absent from the printed menu) and `ES-BATU` (not a drink).
 *
 * The tiles carry no price and no printed name. The price is deliberate: R15 keeps cost away from
 * Barista and Rider, and a number baked into a shared image cannot be filtered per role the way
 * every API field is. The name is dropped so the tile shows the product's database name once,
 * rather than two slightly different spellings of it.
 */
const BY_CODE: Record<string, ImageSourcePropType> = {
  KOPSU: require('../../assets/products/kopsu.png'),
  'SOUL-COFFEE': require('../../assets/products/soul-coffee.png'),
  'SOUL-LATTE': require('../../assets/products/latte.png'),
  'SOUL-MATCHA': require('../../assets/products/matcha.png'),
  'BUTTERSCOTCH-SEASALT-CREAM': require('../../assets/products/butterscotch.png'),
  'SOUL-CHOCOLATE': require('../../assets/products/chocolate.png'),
  'CYTRUS-COLD-BREW': require('../../assets/products/cold-brew.png'),
  THAITEA: require('../../assets/products/thai-tea.png'),
  'LECHEE-TEA': require('../../assets/products/lychee-tea.png'),
};

export function productImage(code: string): ImageSourcePropType | null {
  return BY_CODE[code.toUpperCase()] ?? null;
}

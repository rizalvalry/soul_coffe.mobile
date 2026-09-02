/**
 * Stands in for the `@expo-google-fonts/material-symbols` weight modules.
 *
 * WHY: `expo-router` depends on `expo-symbols` for its NativeTabs icon converter, and
 * `expo-symbols/build/android/weights/regular` reads the font at MODULE EVALUATION time.
 * Metro has no tree shaking, so the 963 KB MaterialSymbols TTF lands in `res/raw` of every
 * release APK even though this app renders none of it — it uses `<Stack>` only, never
 * `<NativeTabs>` or `<SymbolView>` (see app/_layout.tsx and app/(app)/_layout.tsx), and every
 * icon on screen comes from MaterialCommunityIcons.
 *
 * `null` rather than a throwing accessor: the real module is dereferenced eagerly to build a
 * `{ name, font }` record, so anything that throws would crash on startup instead of at use.
 *
 * INVARIANT: remove the `resolveRequest` alias in metro.config.js the moment this app renders
 * an `expo-symbols` <SymbolView> or an expo-router <NativeTabs>. With this stub in place those
 * would fail to load their glyphs — `expo-font`'s loadAsync() gets a null asset.
 */
module.exports = new Proxy(
  { __esModule: true },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Every export of these modules is a single font asset module id.
      return typeof prop === 'string' && prop.startsWith('MaterialSymbols_') ? null : undefined;
    },
  }
);

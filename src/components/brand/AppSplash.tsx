import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { brand, neutral, space } from '@/theme';

/**
 * The JS half of the launch sequence, matching `figma/01-splash-screen.png`.
 *
 * Solid brand ground, the mark reversed to white, the name, a tagline, and a two-tone wave
 * closing the bottom. The native splash configured in app.json is the same ground and the same
 * mark, so the handoff from native to JS is invisible — only the loader appears, which the native
 * splash cannot draw and which is the whole reason this screen exists.
 *
 * The mark is `logo-mark-white.png`, the two-colour artwork with its teal and white swapped: on
 * this background the original would be teal-on-teal and all but vanish. See scripts that built
 * it for why swapping beats tinting.
 */
export function AppSplash({ message = 'Menyiapkan aplikasi...' }: { message?: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <Image
          source={require('../../../assets/logo-mark-white.png')}
          style={styles.mark}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Logo Soul Coffeemate"
        />

        <Text variant="h1" color={neutral[0]} center style={styles.title}>
          SOUL COFFEEMATE
        </Text>

        <Text variant="body" center style={styles.tagline}>
          Operasional gerobak yang rapi,{'\n'}dari request sampai serah terima.
        </Text>
      </View>

      <View style={styles.loader}>
        <ActivityIndicator size="large" color={neutral[0]} />
        <Text variant="caption" style={styles.loaderText} center>
          {message}
        </Text>
      </View>

      {/* Sits under everything else and is purely decorative, so it is hidden from screen
          readers rather than announced as an unnamed image. */}
      <Image
        source={require('../../../assets/splash-wave.png')}
        style={styles.wave}
        resizeMode="stretch"
        accessible={false}
        importantForAccessibility="no"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brand[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', paddingHorizontal: space['3xl'] },

  mark: { width: 150, height: 220 },
  title: { letterSpacing: 3, marginTop: space['2xl'] },
  // Softened white rather than a grey: on a saturated ground a grey tagline turns muddy, while
  // white at reduced opacity keeps the hue and just steps back from the title.
  tagline: { color: 'rgba(255,255,255,0.82)', marginTop: space.md },

  loader: { position: 'absolute', bottom: '18%', alignItems: 'center', gap: space.sm },
  loaderText: { color: 'rgba(255,255,255,0.78)' },

  wave: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '26%',
    zIndex: -1,
  },
});

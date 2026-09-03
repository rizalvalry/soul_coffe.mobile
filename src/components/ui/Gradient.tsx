import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A linear gradient with no native module behind it.
 *
 * WHY NOT `expo-linear-gradient`: it is a native module. Adding one means the redesign is
 * invisible until every device running this app has been rebuilt and reinstalled — and this
 * project ships an APK to field staff, not a hot-reloaded dev client. A gradient is not worth a
 * native release cycle, so this draws one in pure JS and travels in the JS bundle.
 *
 * HOW: N solid bands stacked along the axis, each filled with the colour interpolated at its
 * midpoint. At 24+ bands over a typical header the step between adjacent bands is under one
 * 8-bit level for the palettes in `gradients`, so there is nothing left to band.
 */

export type GradientDirection = 'vertical' | 'horizontal';

export type GradientProps = {
  /** Two or more hex colours (`#RRGGBB`). Distributed evenly across the axis. */
  colors: readonly string[];
  direction?: GradientDirection;
  /** Band count. More is smoother and costs more Views. */
  bands?: number;
  style?: StyleProp<ViewStyle>;
  /** Renders the gradient as an absolutely-positioned fill behind its siblings. */
  fill?: boolean;
  children?: React.ReactNode;
};

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Colour at position `t` (0..1) across an evenly-spaced multi-stop ramp, interpolated in sRGB. */
function sampleRamp(stops: Rgb[], t: number): string {
  if (stops.length === 0) return 'transparent';

  const first = stops[0];
  if (!first) return 'transparent';
  if (stops.length === 1) return `rgb(${first.r},${first.g},${first.b})`;

  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const lower = Math.min(Math.floor(scaled), stops.length - 2);
  const local = scaled - lower;

  const a = stops[lower] ?? first;
  const b = stops[lower + 1] ?? a;

  const mix = (x: number, y: number) => Math.round(x + (y - x) * local);
  return `rgb(${mix(a.r, b.r)},${mix(a.g, b.g)},${mix(a.b, b.b)})`;
}

export function Gradient({
  colors,
  direction = 'vertical',
  bands = 24,
  style,
  fill = false,
  children,
}: GradientProps) {
  const bandColors = useMemo(() => {
    const stops = colors.map(parseHex);
    const count = Math.max(2, bands);

    // Sampled at each band's midpoint, not its leading edge: sampling the edge would clip the
    // final stop entirely, so a 3-stop ramp would never actually reach its darkest colour.
    return Array.from({ length: count }, (_, i) => sampleRamp(stops, (i + 0.5) / count));
  }, [colors, bands]);

  return (
    <View style={[fill ? StyleSheet.absoluteFill : null, style]} pointerEvents={fill ? 'none' : undefined}>
      <View
        style={[StyleSheet.absoluteFill, direction === 'vertical' ? styles.vertical : styles.horizontal]}
        pointerEvents="none"
      >
        {bandColors.map((color, index) => (
          <View
            key={index}
            style={[
              styles.band,
              { backgroundColor: color },
              direction === 'vertical' ? styles.bandVertical : styles.bandHorizontal,
            ]}
          />
        ))}
      </View>

      {children}
    </View>
  );
}

/**
 * A soft light bloom, for gradient surfaces that need a focal point rather than a flat wash.
 * Three concentric translucent circles at falling opacity, rather than a real radial gradient —
 * cheap, and reads as a diffuse glow at the sizes this is used at.
 */
export function GradientBloom({
  size = 220,
  color = 'rgba(255,255,255,0.16)',
  style,
}: {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" style={[styles.bloomWrap, style]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}>
        <View
          style={{
            position: 'absolute',
            left: size * 0.15,
            top: size * 0.15,
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
            backgroundColor: color,
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: size * 0.105,
              top: size * 0.105,
              width: size * 0.49,
              height: size * 0.49,
              borderRadius: size * 0.245,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  vertical: { flexDirection: 'column' },
  horizontal: { flexDirection: 'row' },
  band: { flex: 1 },
  bandVertical: { marginBottom: -0.5 },
  bandHorizontal: { marginRight: -0.5 },
  bloomWrap: { position: 'absolute' },
});

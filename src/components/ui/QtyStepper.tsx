import { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { Touchable } from './Touchable';
import { enter } from './Motion';
import { brand, feedback, neutral, pressScale, radius, semantic, space, spring, timing, touch } from '@/theme';

export type QtyStepperProps = {
  value: number;
  onChange: (next: number) => void;
  /** Hard ceiling. For approve/prepare/receive steps this is the previous stage's quantity (R4). */
  max: number;
  min?: number;
  disabled?: boolean;
  /** Shown under the field when the value is capped, e.g. "maks. 5 (disetujui)". */
  capHint?: string;
};

/**
 * Integer-only quantity control. Cups are not divisible (R7).
 *
 * The `max` cap enforces the monotonic chain (R4) at the input, so a staff member cannot even
 * type an impossible number. The server re-validates regardless — this is convenience, not the
 * guarantee.
 *
 * The number itself pops on every change — a short squash-and-settle. It is the only feedback a
 * tap on a 48dp circular button gets otherwise; without it, repeated taps while the screen is
 * mid-scroll feel unacknowledged, and people tap again and over-order.
 */
export function QtyStepper({ value, onChange, max, min = 0, disabled = false, capHint }: QtyStepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const atMax = value >= max;

  const pop = useSharedValue(0);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    pop.value = withSequence(withTiming(1, { ...timing.fast, duration: 90 }), withSpring(0, spring.bouncy));
  }, [value, pop]);

  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.18 }],
  }));

  const onText = (text: string) => {
    const digits = text.replace(/[^\d]/g, '');
    onChange(digits === '' ? min : clamp(parseInt(digits, 10)));
  };

  return (
    <View>
      <View style={styles.row}>
        <Touchable
          onPress={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          scaleTo={pressScale.icon}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Kurangi jumlah"
          style={[styles.step, (disabled || value <= min) && styles.stepInert]}
        >
          <MaterialCommunityIcons
            name="minus"
            size={20}
            color={disabled || value <= min ? semantic.textSubtle : brand[700]}
          />
        </Touchable>

        <Animated.View style={numberStyle}>
          <TextInput
            value={String(value)}
            onChangeText={onText}
            keyboardType="number-pad"
            editable={!disabled}
            selectTextOnFocus
            accessibilityLabel="Jumlah cups"
            style={[styles.input, disabled && styles.inputDisabled]}
          />
        </Animated.View>

        <Touchable
          onPress={() => onChange(clamp(value + 1))}
          disabled={disabled || atMax}
          scaleTo={pressScale.icon}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Tambah jumlah"
          style={[styles.step, (disabled || atMax) && styles.stepInert]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={disabled || atMax ? semantic.textSubtle : brand[700]} />
        </Touchable>
      </View>

      {atMax && capHint ? (
        <Animated.View entering={enter('below', 0, 4)}>
          <Text variant="micro" color={feedback.warningFg} style={styles.hint}>
            {capHint}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  // Circular, like the reference design's quantity controls. The diameter is still the full
  // touch minimum, so rounding the corners costs no reachable area.
  step: {
    width: touch.minTarget,
    height: touch.minTarget,
    borderRadius: touch.minTarget / 2,
    borderWidth: 1,
    borderColor: brand[200],
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInert: { backgroundColor: neutral[100], borderColor: semantic.border },
  input: {
    width: 58,
    height: touch.minTarget,
    borderRadius: radius.md,
    borderWidth: 0,
    backgroundColor: neutral[100],
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: semantic.text,
  },
  inputDisabled: { backgroundColor: neutral[100], color: semantic.textMuted },
  hint: { marginTop: space.xxs },
});

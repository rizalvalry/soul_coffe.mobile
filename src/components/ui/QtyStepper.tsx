import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from './Text';
import { brand, feedback, neutral, radius, semantic, space, touch } from '@/theme';

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
 */
export function QtyStepper({
  value,
  onChange,
  max,
  min = 0,
  disabled = false,
  capHint,
}: QtyStepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const atMax = value >= max;

  const onText = (text: string) => {
    const digits = text.replace(/[^\d]/g, '');
    onChange(digits === '' ? min : clamp(parseInt(digits, 10)));
  };

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Kurangi jumlah"
          style={({ pressed }) => [
            styles.step,
            (disabled || value <= min) && styles.stepInert,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name="minus"
            size={20}
            color={disabled || value <= min ? semantic.textSubtle : brand[700]}
          />
        </Pressable>

        <TextInput
          value={String(value)}
          onChangeText={onText}
          keyboardType="number-pad"
          editable={!disabled}
          selectTextOnFocus
          accessibilityLabel="Jumlah cups"
          style={[styles.input, disabled && styles.inputDisabled]}
        />

        <Pressable
          onPress={() => onChange(clamp(value + 1))}
          disabled={disabled || atMax}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Tambah jumlah"
          style={({ pressed }) => [
            styles.step,
            (disabled || atMax) && styles.stepInert,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name="plus"
            size={20}
            color={disabled || atMax ? semantic.textSubtle : brand[700]}
          />
        </Pressable>
      </View>

      {atMax && capHint ? (
        <Text variant="micro" color={feedback.warningFg} style={styles.hint}>
          {capHint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  step: {
    width: touch.minTarget,
    height: touch.minTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand[200],
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInert: { backgroundColor: neutral[100], borderColor: semantic.border },
  pressed: { opacity: 0.6 },
  input: {
    width: 58,
    height: touch.minTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: neutral[0],
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: semantic.text,
  },
  inputDisabled: { backgroundColor: neutral[100], color: semantic.textMuted },
  hint: { marginTop: space.xxs },
});

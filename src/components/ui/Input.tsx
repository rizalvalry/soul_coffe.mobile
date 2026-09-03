import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from './Text';
import { feedback, neutral, radius, semantic, space, touch } from '@/theme';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label: string;
  icon?: string;
  error?: string;
  hint?: string;
  secure?: boolean;
  containerStyle?: ViewStyle;
};

export function Input({
  label,
  icon,
  error,
  hint,
  secure = false,
  containerStyle,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Transparent rather than absent when at rest: the ring is always 2px wide, so gaining focus
  // colours it in instead of growing it, and the field never shifts the layout under the thumb.
  const borderColor = error
    ? feedback.dangerFg
    : focused
      ? semantic.focusRing
      : 'transparent';

  return (
    <View style={containerStyle}>
      <Text variant="caption" color={semantic.textMuted} style={styles.label}>
        {label}
      </Text>

      <View style={[styles.field, { borderColor, borderWidth: 2 }]}>
        {icon ? (
          <MaterialCommunityIcons
            name={icon as never}
            size={20}
            color={error ? feedback.dangerFg : semantic.textMuted}
          />
        ) : null}

        <TextInput
          style={styles.input}
          placeholderTextColor={semantic.textSubtle}
          secureTextEntry={secure && !revealed}
          accessibilityLabel={label}
          {...rest}
          // After the spread, so a caller passing onFocus/onBlur adds to the focus ring rather
          // than silently replacing it — react-hook-form's onBlur used to do exactly that.
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          >
            <MaterialCommunityIcons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={semantic.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.messageRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={feedback.dangerFg} />
          <Text variant="caption" color={feedback.dangerFg} style={styles.messageText}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" color={semantic.textSubtle} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space.xs },
  // A filled, borderless field on a soft ground — the reference design's inputs are shapes, not
  // outlined boxes. The focus ring is still drawn as a border, so focus stays visible: a filled
  // field whose only focus cue is a colour shift is not enough on a sunlit phone.
  field: {
    minHeight: touch.inputHeight,
    borderRadius: radius.md,
    backgroundColor: neutral[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: semantic.text,
    paddingVertical: space.md,
  },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  messageText: { flex: 1 },
  hint: { marginTop: space.xs },
});

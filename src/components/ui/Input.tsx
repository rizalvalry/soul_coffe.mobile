import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { Touchable } from './Touchable';
import { enter } from './Motion';
import { brand, feedback, neutral, pressScale, radius, semantic, space, timing, touch } from '@/theme';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label: string;
  icon?: string;
  error?: string;
  hint?: string;
  secure?: boolean;
  containerStyle?: ViewStyle;
};

/**
 * Text field.
 *
 * The focus ring now transitions colour on the UI thread instead of snapping between transparent
 * and `focusRing` on the same frame. The field itself stays a filled, borderless shape at rest —
 * the reference layout's inputs are shapes, not outlined boxes — and the ring only lights up on
 * focus, still drawn as a real border so it stays visible on a sunlit phone rather than depending
 * on a colour shift too subtle to see outdoors.
 */
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
  const [revealed, setRevealed] = useState(false);
  const focus = useSharedValue(0);
  const hasError = Boolean(error);

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (event) => {
      focus.value = withTiming(1, timing.base);
      onFocus?.(event);
    },
    [focus, onFocus],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (event) => {
      focus.value = withTiming(0, timing.base);
      onBlur?.(event);
    },
    [focus, onBlur],
  );

  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: hasError ? feedback.dangerFg : interpolateColor(focus.value, [0, 1], ['transparent', brand[500]]),
  }));

  return (
    <View style={containerStyle}>
      <Text variant="caption" color={semantic.textMuted} style={styles.label}>
        {label}
      </Text>

      <Animated.View style={[styles.field, fieldStyle]}>
        {icon ? (
          <MaterialCommunityIcons
            name={icon as never}
            size={20}
            color={hasError ? feedback.dangerFg : semantic.textMuted}
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
          onFocus={handleFocus}
          onBlur={handleBlur}
        />

        {secure ? (
          <Touchable
            onPress={() => setRevealed((v) => !v)}
            scaleTo={pressScale.icon}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          >
            <MaterialCommunityIcons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={semantic.textMuted}
            />
          </Touchable>
        ) : null}
      </Animated.View>

      {error ? (
        <Animated.View entering={enter('below', 0, 6)} style={styles.messageRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={feedback.dangerFg} />
          <Text variant="caption" color={feedback.dangerFg} style={styles.messageText}>
            {error}
          </Text>
        </Animated.View>
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
  field: {
    minHeight: touch.inputHeight,
    borderRadius: radius.md,
    borderWidth: 2,
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

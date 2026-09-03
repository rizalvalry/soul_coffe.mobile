import { StyleSheet, type TextStyle } from 'react-native';

export * from './tokens';
export * from './motion';
import { type } from './tokens';

/**
 * React Native's TextStyle types fontWeight as a union of string literals, but `as const` on the
 * token object widens it to `string`. This narrows it back without duplicating the scale.
 */
export function textStyle(variant: keyof typeof type): TextStyle {
  return type[variant] as TextStyle;
}

/** Hairline border that stays visible on high-density Android panels. */
export const hairline = StyleSheet.hairlineWidth;

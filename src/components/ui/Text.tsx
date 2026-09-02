import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { semantic, type } from '@/theme';

type Variant = keyof typeof type;

export type TextProps = RNTextProps & {
  variant?: Variant;
  color?: string;
  center?: boolean;
};

/**
 * The only text component in the app. Using it everywhere means the type scale and colour
 * contract in tokens.ts cannot be bypassed by a stray `fontSize`.
 */
export function Text({ variant = 'body', color, center, style, ...rest }: TextProps) {
  return (
    <RNText
      style={[
        type[variant],
        { color: color ?? semantic.text },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    />
  );
}

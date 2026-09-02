import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { semantic, space } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView. Off for screens that manage their own list. */
  scroll?: boolean;
  /** Background colour override — used by the login screen's branded header. */
  background?: string;
  contentStyle?: ViewStyle;
  /** Respect the bottom safe area. Off when a sticky footer handles it. */
  edgeBottom?: boolean;
};

export function Screen({
  children,
  scroll = true,
  background = semantic.bg,
  contentStyle,
  edgeBottom = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingTop: insets.top,
    paddingBottom: edgeBottom ? insets.bottom : 0,
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: background }, padding]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, flexGrow: 1 },
});

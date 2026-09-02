import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '@/lib/keyboard';
import { brand, semantic, space } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView. Off for screens that manage their own list. */
  scroll?: boolean;
  /** Background colour override — used by the login screen's branded header. */
  background?: string;
  contentStyle?: ViewStyle;
  /** Respect the bottom safe area. Off when a sticky footer handles it. */
  edgeBottom?: boolean;
  /**
   * Pull-to-refresh. Every screen that reads server state passes these, so a staff member can
   * always force a refresh with the same gesture instead of hunting for a per-screen button.
   * Screens that own a FlatList attach their own RefreshControl to that list instead.
   */
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({
  children,
  scroll = true,
  background = semantic.bg,
  contentStyle,
  edgeBottom = true,
  refreshing,
  onRefresh,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();

  const padding: ViewStyle = {
    paddingTop: insets.top,
    paddingBottom: edgeBottom ? insets.bottom : 0,
  };

  const body = scroll ? (
    <ScrollView
      // The keyboard inset is applied last so it wins over a screen's own contentStyle padding.
      contentContainerStyle={[styles.content, contentStyle, { paddingBottom: keyboardInset }]}
      // "handled" lets a tap on inert content dismiss the keyboard while still letting buttons
      // fire on the first tap; "on-drag" adds the swipe-down that users reach for first.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      {...(onRefresh
        ? {
            refreshControl: (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
                colors={[brand[600]]}
                tintColor={brand[600]}
              />
            ),
          }
        : {})}
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

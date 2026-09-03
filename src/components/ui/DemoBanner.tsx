import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Text } from './Text';
import { Touchable } from './Touchable';
import { isDemoMode } from '@/features/demo/config';
import { useAuth } from '@/features/auth/store';
import { rolesByPriority, roleMeta, type Role } from '@/domain/roles';
import { feedback, neutral, pressScale, radius, space, touch } from '@/theme';

/**
 * Permanent, non-dismissible notice that this build runs the offline demo backend on fabricated
 * in-memory data — no server, no database, no network (see `src/features/demo/config.ts`). A demo
 * build must never be mistakable for the real app, which is why this cannot be closed and why it
 * renders on every screen, authenticated or not (`app/(app)/_layout.tsx`, `app/(auth)/_layout.tsx`).
 *
 * Also carries the role switcher: since there is no real backend to authenticate five different
 * people against, one person walks the whole flow on one device by tapping between roles here —
 * see `useAuth().signInAsDemo()` and `src/features/auth/api.ts`'s `loginAsDemoRole()`.
 */
export function DemoBanner() {
  const demoModeOn = isDemoMode();
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const signInAsDemo = useAuth((s) => s.signInAsDemo);

  if (!demoModeOn) return null;

  const activeRole = session?.user.role ?? null;

  const switchRole = async (role: Role) => {
    if (role === activeRole) return;
    const ok = await signInAsDemo(role);
    if (ok) router.replace('/menu');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.noticeRow} accessibilityRole="alert">
        <MaterialCommunityIcons name="flask-outline" size={14} color={feedback.warningFg} />
        <Text variant="micro" color={feedback.warningFg} style={styles.noticeText}>
          MODE DEMO — DATA TIDAK NYATA
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleRow}>
        {rolesByPriority.map((role) => {
          const meta = roleMeta[role];
          const active = role === activeRole;
          return (
            <Touchable
              key={role}
              onPress={() => void switchRole(role)}
              scaleTo={pressScale.control}
              accessibilityRole="button"
              accessibilityLabel={`Beralih ke role ${meta.label}`}
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <MaterialCommunityIcons name={meta.icon as never} size={13} color={active ? neutral[0] : feedback.warningFg} />
              <Text variant="micro" color={active ? neutral[0] : feedback.warningFg}>
                {meta.label}
              </Text>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: feedback.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: feedback.warningBorder,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    gap: space.xxs,
  },
  noticeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  noticeText: { letterSpacing: 0.5 },
  roleRow: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    borderWidth: 1,
    borderColor: feedback.warningBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    minHeight: touch.minTarget * 0.6,
  },
  chipActive: { backgroundColor: feedback.warningFg, borderColor: feedback.warningFg },
});

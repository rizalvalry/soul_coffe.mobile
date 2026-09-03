import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { CountBadge, Chip } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { Touchable } from '@/components/ui/Touchable';
import { Gradient, GradientBloom } from '@/components/ui/Gradient';
import { enter } from '@/components/ui/Motion';
import { SoulLogo } from '@/components/brand/SoulLogo';
import { NewsSlider } from '@/components/news/NewsSlider';
import { useAuth } from '@/features/auth/store';
import { IMPLEMENTED_ROUTES, menuByRole, type MenuItem } from '@/features/navigation/menu';
import { ROLES, roleMeta } from '@/domain/roles';
import { brand, gradients, neutral, pressScale, radius, shadow, semantic, space, touch } from '@/theme';

/**
 * Live badge counters.
 *
 * Deliberately returns nothing until the realtime layer exists (Phase 4). Rendering a plausible
 * fake number here would be worse than rendering none — an operations app that shows an invented
 * count of pending approvals teaches its users to distrust it.
 */
function useMenuBadges(): Partial<Record<NonNullable<MenuItem['badge']>, number>> {
  return {};
}

/** Time-of-day greeting. These shifts start before dawn and run past dark, so all three matter. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export default function MenuScreen() {
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const badges = useMenuBadges();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const user = session?.user;
  const items = useMemo(() => (user ? menuByRole[user.role] : []), [user]);

  // Declared above the `!user` bail-out: a hook after an early return runs conditionally, which
  // is exactly the ordering violation React cannot recover from.
  const refreshAll = useCallback(() => {
    setRefreshing(true);
    void queryClient.invalidateQueries().finally(() => setRefreshing(false));
  }, [queryClient]);

  if (!user) return null;

  const meta = roleMeta[user.role];
  const primary = items.filter((i) => i.primary);
  const secondary = items.filter((i) => !i.primary);

  const confirmSignOut = () => {
    Alert.alert('Keluar dari aplikasi?', 'Anda perlu masuk kembali menggunakan nomor HP.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const open = (item: MenuItem) => {
    if (IMPLEMENTED_ROUTES.has(item.route)) {
      router.push(item.route as Href);
      return;
    }

    // Not built yet. Report the route and its requirement rather than 404-ing or showing a
    // blank screen that looks broken.
    router.push({
      pathname: '/coming-soon',
      params: { title: item.label, route: item.route, requirement: item.requirement },
    });
  };

  return (
    // The menu owns no query of its own, so its pull-to-refresh drops every cached read instead.
    // That is what a user actually means by pulling here: refresh the app, not this one screen.
    <Screen refreshing={refreshing} onRefresh={refreshAll}>
      <Animated.View entering={enter('above')} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <SoulLogo size={34} showWordmark={false} />
          </View>
          <View style={styles.headerText}>
            <Text variant="caption" color={semantic.textMuted}>
              {greeting()},
            </Text>
            <Text variant="h3" numberOfLines={1}>
              {user.name}
            </Text>
          </View>
        </View>

        <IconButton icon="logout-variant" label="Keluar dari aplikasi" onPress={confirmSignOut} />
      </Animated.View>

      <Animated.View entering={enter('below', 1)}>
        <Card style={styles.roleCard} accent>
          <View style={styles.roleRow}>
            <View style={styles.roleIcon}>
              <MaterialCommunityIcons name={meta.icon as never} size={26} color={neutral[0]} />
            </View>
            <View style={styles.roleText}>
              <Text variant="micro" color={brand[700]}>
                ROLE {meta.priority} DARI {ROLES.length}
              </Text>
              <Text variant="h2">{meta.label}</Text>
              <Text variant="caption" color={semantic.textMuted}>
                {meta.description}
              </Text>
            </View>
          </View>

          {user.cartCode || user.kitchenName ? (
            <View style={styles.contextStrip}>
              {user.cartCode ? (
                <Chip
                  tone="brand"
                  label={`Kode Sepeda ${user.cartCode}`}
                  icon={<MaterialCommunityIcons name="moped-outline" size={14} color={brand[700]} />}
                />
              ) : null}
              {user.kitchenName ? (
                <Chip
                  tone="brand"
                  label={user.kitchenName}
                  icon={<MaterialCommunityIcons name="store-outline" size={14} color={brand[700]} />}
                />
              ) : null}
            </View>
          ) : null}
        </Card>
      </Animated.View>

      {/* Sits above the menu because it is the only thing on this screen that changes without the
          user doing anything, and it renders nothing at all when there is no highlighted post —
          see NewsSlider for why a permanent empty state here would be worse than no slider. */}
      <NewsSlider />

      {primary.length > 0 ? (
        <Animated.View entering={enter('below', 2)}>
          <Text variant="micro" color={semantic.textSubtle} style={styles.sectionLabel}>
            MENU UTAMA
          </Text>
        </Animated.View>
      ) : null}

      {primary.map((item, index) => (
        <Animated.View key={item.id} entering={enter('below', 3 + index)}>
          <Touchable
            onPress={() => open(item)}
            scaleTo={pressScale.surface}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint={item.sublabel}
            style={styles.primaryTile}
          >
            <Gradient colors={gradients.brand} fill bands={20} />
            <GradientBloom size={160} color="rgba(255,255,255,0.12)" style={styles.primaryBloom} />

            <View style={styles.primaryIcon}>
              <MaterialCommunityIcons name={item.icon as never} size={28} color={neutral[0]} />
            </View>
            <View style={styles.primaryText}>
              <Text variant="h3" color={neutral[0]}>
                {item.label}
              </Text>
              <Text variant="caption" color={brand[100]}>
                {item.sublabel}
              </Text>
            </View>
            {item.badge ? <CountBadge count={badges[item.badge] ?? 0} /> : null}
            <MaterialCommunityIcons name="chevron-right" size={24} color={neutral[0]} />
          </Touchable>
        </Animated.View>
      ))}

      {secondary.length > 0 ? (
        <Animated.View entering={enter('below', 4)}>
          <Text variant="micro" color={semantic.textSubtle} style={styles.sectionLabel}>
            MENU LAINNYA
          </Text>
        </Animated.View>
      ) : null}

      <View style={styles.grid}>
        {secondary.map((item, index) => (
          <Animated.View key={item.id} entering={enter('below', 5 + index)} style={styles.tileWrap}>
            <Touchable
              onPress={() => open(item)}
              scaleTo={pressScale.surface}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityHint={item.sublabel}
              style={styles.tile}
            >
              <View style={styles.tileTop}>
                <View style={styles.tileIcon}>
                  <MaterialCommunityIcons name={item.icon as never} size={22} color={brand[700]} />
                </View>
                {item.badge ? <CountBadge count={badges[item.badge] ?? 0} /> : null}
              </View>
              <Text variant="bodyStrong" numberOfLines={2}>
                {item.label}
              </Text>
              <Text variant="caption" color={semantic.textMuted} numberOfLines={2}>
                {item.sublabel}
              </Text>
            </Touchable>
          </Animated.View>
        ))}
      </View>

      <Text variant="micro" color={semantic.textSubtle} center style={styles.footer}>
        Soul Coffeemate · Operasional Gerobak Motor Listrik
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  avatar: {
    width: touch.minTarget - 4,
    height: touch.minTarget - 4,
    borderRadius: radius.pill,
    backgroundColor: neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  headerText: { flex: 1 },

  roleCard: { gap: space.lg },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  roleIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: brand[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleText: { flex: 1, gap: space.xxs },
  contextStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.md,
  },

  sectionLabel: { letterSpacing: 1, marginTop: space.sm },

  primaryTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    padding: space.lg,
    minHeight: touch.tileMinHeight,
    overflow: 'hidden',
    ...shadow.raised,
  },
  primaryBloom: { top: -70, right: -40 },
  primaryIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { flex: 1, gap: space.xxs },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tileWrap: { flexBasis: '47%', flexGrow: 1 },
  tile: {
    minHeight: touch.tileMinHeight,
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    ...shadow.card,
    padding: space.md,
    gap: space.xs,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: { marginTop: space.lg },
});

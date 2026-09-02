import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { CountBadge } from '@/components/ui/Badge';
import { SoulLogo } from '@/components/brand/SoulLogo';
import { useAuth } from '@/features/auth/store';
import { IMPLEMENTED_ROUTES, menuByRole, type MenuItem } from '@/features/navigation/menu';
import { roleMeta } from '@/domain/roles';
import { brand, elevation, neutral, radius, semantic, space, touch } from '@/theme';

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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <SoulLogo size={44} showWordmark={false} />
          <View style={styles.headerText}>
            <Text variant="caption" color={semantic.textMuted}>
              Selamat bertugas,
            </Text>
            <Text variant="h3" numberOfLines={1}>
              {user.name}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={confirmSignOut}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Keluar dari aplikasi"
          style={styles.signOut}
        >
          <MaterialCommunityIcons name="logout" size={22} color={semantic.textMuted} />
        </Pressable>
      </View>

      <Card style={styles.roleCard} accent>
        <View style={styles.roleRow}>
          <View style={styles.roleIcon}>
            <MaterialCommunityIcons name={meta.icon as never} size={26} color={neutral[0]} />
          </View>
          <View style={styles.roleText}>
            <Text variant="micro" color={brand[700]}>
              ROLE {meta.priority} DARI 5
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
              <View style={styles.contextItem}>
                <MaterialCommunityIcons name="moped-outline" size={16} color={brand[700]} />
                <Text variant="caption" color={semantic.text}>
                  Kode Sepeda {user.cartCode}
                </Text>
              </View>
            ) : null}
            {user.kitchenName ? (
              <View style={styles.contextItem}>
                <MaterialCommunityIcons name="store-outline" size={16} color={brand[700]} />
                <Text variant="caption" color={semantic.text}>
                  {user.kitchenName}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Text variant="micro" color={semantic.textSubtle} style={styles.sectionLabel}>
        MENU UTAMA
      </Text>

      {primary.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => open(item)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityHint={item.sublabel}
          style={({ pressed }) => [styles.primaryTile, pressed && styles.pressed]}
        >
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
          <MaterialCommunityIcons name="chevron-right" size={24} color={brand[200]} />
        </Pressable>
      ))}

      <View style={styles.grid}>
        {secondary.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => open(item)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint={item.sublabel}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
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
          </Pressable>
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
  headerText: { flex: 1 },
  signOut: {
    width: touch.minTarget,
    height: touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.md,
  },
  contextItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  sectionLabel: { letterSpacing: 1, marginTop: space.sm },

  primaryTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: brand[700],
    borderRadius: radius.lg,
    padding: space.lg,
    minHeight: touch.tileMinHeight,
    ...elevation.md,
  },
  primaryIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { flex: 1, gap: space.xxs },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: touch.tileMinHeight,
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    padding: space.md,
    gap: space.xs,
    ...elevation.sm,
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

  pressed: { opacity: 0.78 },
  footer: { marginTop: space.lg },
});

import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter, useSitemap, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/store';
import { useBadges } from '@/features/refill/queries';
import { useAttendanceStatus } from '@/features/showcase/queries';
import { attendanceTileSubtitle } from '@/features/showcase/attendanceTile';
import { riderDayGate, riderGateMessage } from '@/features/showcase/riderDayGate';
import { menuForUser, menuItemsWithScreens, type MenuItem } from '@/features/navigation/menu';

/**
 * Live badge counters.
 *
 * This used to return `{}` on purpose, while the realtime layer did not exist yet — showing an
 * invented count of pending approvals would have taught people to distrust the number. The
 * realtime layer exists now, so the honest thing is the real count: `GET /badges` is scoped
 * server-side to the caller's own role, and `invalidateRefillData()` invalidates `qk.badges`
 * on inbound Pusher events. Reconnect, foreground return, and this screen's pull-to-refresh
 * catch up after missed events.
 *
 * `pendingSync` stays absent rather than being faked as 0: it would count writes queued on the
 * device, which nothing tracks yet, and no menu item asks for it. A tile that always reads "0
 * waiting to sync" is exactly the invented number the original comment warned about.
 */
function useMenuBadges(): Partial<Record<NonNullable<MenuItem['badge']>, number>> {
  const { data } = useBadges();

  // While the first fetch is in flight there is no count to show. Returning nothing renders no
  // badge at all, which is right — a "0" that later becomes "3" reads as though something just
  // arrived, when in fact it was always there and simply had not loaded.
  if (!data) return {};

  return {
    pendingApprovals: data.pendingApprovals,
    incomingRequests: data.incomingRequests,
    readyToPick: data.readyToPick,
    myRequests: data.myRequests,
  };
}

/** Time-of-day greeting. These shifts start before dawn and run past dark, so all three matter. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function useHomeController() {
  const router = useRouter();
  const sitemap = useSitemap();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const refreshUser = useAuth((s) => s.refreshUser);
  const badges = useMenuBadges();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const user = session?.user;
  const attendance = useAttendanceStatus(user?.role === 'STAFF' || user?.role === 'BARISTA');
  const dayGate = user?.role === 'STAFF' ? riderDayGate(attendance.data) : 'legacy';
  const gateMessage = riderGateMessage(dayGate);
  const items = useMemo(() => (user ? menuItemsWithScreens(menuForUser(user), sitemap) : []), [user, sitemap]);

  // Hooks stay above the screen's `!user` bail-out so their ordering never changes.
  const refreshAll = useCallback(() => {
    setRefreshing(true);
    void Promise.allSettled([refreshUser(), queryClient.invalidateQueries()])
      .finally(() => setRefreshing(false));
  }, [queryClient, refreshUser]);

  const primary = items.filter((i) => i.primary);
  const secondary = items.filter((i) => !i.primary);

  const confirmSignOut = () => {
    Alert.alert('Keluar dari aplikasi?', 'Anda perlu masuk kembali menggunakan nomor HP.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const open = (item: MenuItem) => {
    router.push(item.route as Href);
  };
  const isGatedTransaction = (item: MenuItem) =>
    !!gateMessage && (item.id === 'staff-closing' || item.id === 'staff-refill-new');
  const tileSubtitle = (item: MenuItem) => {
    if (item.id !== 'staff-absen' && item.id !== 'barista-absen') return item.sublabel;
    return attendanceTileSubtitle(user!.role, attendance.data);
  };

  return {
    user, badges, refreshing, refreshAll, primary, secondary, gateMessage,
    confirmSignOut, open, isGatedTransaction, tileSubtitle, greeting,
  };
}

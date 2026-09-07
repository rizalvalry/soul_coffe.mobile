import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton } from './Button';
import { CountBadge } from './Badge';
import { useNotifications } from '@/features/refill/queries';

/**
 * The lonceng icon — the piece that was missing entirely.
 *
 * `useBadges()` on the menu tiles already counted business-process work waiting for a role
 * (approvals, incoming requests…), but nothing rendered the persisted per-user inbox
 * (`GET /notifications`, `AppNotification`) anywhere: no screen ever called `useNotifications()`.
 * The backend and the query hook existed; only the bell itself did not. This is that bell.
 *
 * Mounted on the menu screen's header — the one place every role always passes through — rather
 * than on every screen, since this app has no persistent top bar shared across routes.
 */
export function NotificationBell() {
  const router = useRouter();
  const { data } = useNotifications({ unreadOnly: true });
  const unread = data?.length ?? 0;

  return (
    <View style={styles.wrap}>
      <IconButton
        icon="bell-outline"
        label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        onPress={() => router.push('/notifications')}
      />
      {unread > 0 ? <CountBadge count={unread} style={styles.badge} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4 },
});

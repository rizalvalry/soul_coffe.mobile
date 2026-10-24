import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { IconButton } from './Button';
import { CountBadge } from './Badge';
import { useNotifications } from '@/features/refill/queries';
import { entrance, spring, timing } from '@/theme';

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
  const previousUnread = useRef(unread);
  const pop = useSharedValue(0);

  useEffect(() => {
    if (previousUnread.current === unread) return;
    previousUnread.current = unread;
    pop.value = withSequence(withTiming(1, timing.fast), withSpring(0, spring.bouncy));
  }, [unread, pop]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * (entrance.badgePeak - 1) }],
  }));

  return (
    <View style={styles.wrap}>
      <IconButton
        icon="bell-outline"
        label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        onPress={() => router.push('/notifications')}
      />
      {unread > 0 ? (
        <Animated.View style={[styles.badge, badgeStyle]} pointerEvents="none">
          <CountBadge count={unread} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4 },
});

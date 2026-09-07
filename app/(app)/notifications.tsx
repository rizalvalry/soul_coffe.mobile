import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMarkNotificationRead, useNotifications } from '@/features/refill/queries';
import { routeFor } from '@/features/push/usePushNotifications';
import { brand, neutral, radius, shadow, semantic, space } from '@/theme';
import type { AppNotification } from '@/domain/types';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * The in-app inbox for `AppNotification` — the persisted half of E15's two transports.
 *
 * A row here exists independent of whether the socket or the push notification actually reached
 * the device: `EventPublisher` writes it in the same request that dispatches both, so this list
 * is the one place a user can see everything they were meant to be told, even after missing the
 * banner or the toast that announced it live.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const inbox = useNotifications();
  const markRead = useMarkNotificationRead();

  const rows = inbox.data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  const open = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id);

    const target = routeFor({ refill_request_id: n.refill_request_id, type: n.type });
    if (target) router.push(target as Href);
  };

  return (
    <Screen refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
      <View style={styles.top}>
        <Button label="Kembali" icon="chevron-left" variant="ghost" fullWidth={false} onPress={() => router.back()} />
      </View>

      <View>
        <Text variant="h2">Notifikasi</Text>
        <Text variant="caption" color={semantic.textMuted}>
          {unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}
        </Text>
      </View>

      {inbox.isLoading ? (
        <Card>
          <Text color={semantic.textMuted} center>
            Memuat notifikasi...
          </Text>
        </Card>
      ) : inbox.isError ? (
        <Card style={styles.stateCard}>
          <EmptyState icon="alert-circle-outline" title="Gagal memuat notifikasi" subtitle="Periksa koneksi internet Anda." />
          <Button label="Coba Lagi" variant="secondary" onPress={() => void inbox.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="bell-off-outline"
            title="Belum ada notifikasi"
            subtitle="Kejadian yang melibatkan Anda akan muncul di sini."
          />
        </Card>
      ) : (
        rows.map((n) => <NotificationRow key={n.id} notification={n} onPress={() => open(n)} />)
      )}
    </Screen>
  );
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const isUnread = !notification.read_at;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={notification.title}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="bell-ring-outline" size={20} color={brand[600]} />
        {isUnread ? <View style={styles.unreadDot} /> : null}
      </View>

      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {notification.title}
        </Text>
        <Text variant="caption" color={semantic.textMuted} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text variant="micro" color={semantic.textSubtle}>
          {formatWhen(notification.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  stateCard: { gap: space.md },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    padding: space.md,
    ...shadow.card,
  },
  rowPressed: { opacity: 0.75 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: brand[600],
    borderWidth: 2,
    borderColor: neutral[0],
  },
  rowText: { flex: 1, gap: space.xxs },
});

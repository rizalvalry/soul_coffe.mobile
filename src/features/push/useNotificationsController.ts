import { useRouter, type Href } from 'expo-router';

import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/features/refill/queries';
import { routeFor } from '@/features/push/usePushNotifications';
import { useAuth } from '@/features/auth/store';
import type { AppNotification } from '@/domain/types';

export function useNotificationsController() {
  const router = useRouter();
  const user = useAuth((s) => s.session?.user);
  const inbox = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const rows = inbox.data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  const open = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id);

    const target = user ? routeFor({ refill_request_id: n.refill_request_id, type: n.type, status: n.status },
      user.role, user.abilities, user.isSuperAdmin) : null;
    if (target) router.push(target as Href);
  };

  return { router, inbox, markAllRead, rows, unread, open };
}

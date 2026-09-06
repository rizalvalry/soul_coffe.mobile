import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/store';
import { invalidateRefillData } from '@/features/refill/queries';
import { claimEvent } from '@/features/realtime/seen';
import { syncRegistration } from './registration';

/**
 * Foreground presentation.
 *
 * Declared at module scope, not in the hook: expo-notifications reads this handler when a
 * notification arrives, which can be before any component has mounted. `claimEvent` is what stops
 * a banner appearing for something the Pusher socket already applied to the screen the user is
 * looking at (E15) — the notification still exists in the tray, it simply does not interrupt.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const eventId = typeof data?.['event_id'] === 'string' ? data['event_id'] : null;
    const isNew = claimEvent(eventId);

    return {
      shouldShowBanner: isNew,
      shouldShowList: true,
      shouldPlaySound: isNew,
      shouldSetBadge: false,
    };
  },
});

/** Where a tapped notification should land, by event type. */
function routeFor(data: Record<string, unknown>): string | null {
  const refillId = data['refill_request_id'];
  if (refillId !== null && refillId !== undefined && `${refillId}` !== '') {
    return `/staff/requests/${refillId}`;
  }

  const type = typeof data['type'] === 'string' ? data['type'] : '';

  switch (type) {
    case 'AttendanceClockedIn':
    case 'StaffAttendanceWindowOpened':
      return '/absen';
    case 'NewsPostPublished':
      return '/news';
    case 'PinResetRequested':
    case 'LoginPinChanged':
      // Both are account-level and have no screen of their own; the menu is where the user
      // orients themselves.
      return '/menu';
    default:
      return null;
  }
}

/**
 * Wires push into the app: registration, cache invalidation on arrival, navigation on tap.
 *
 * Mounted once, from the authenticated layout. Everything it does is additive to `useRealtime` —
 * if push never arrives (permission denied, no Firebase config, no Play Services) the socket and
 * its polling fallback still keep every screen current.
 */
export function usePushNotifications() {
  const router = useRouter();
  const client = useQueryClient();
  const session = useAuth((s) => s.session);
  const routerRef = useRef(router);
  routerRef.current = router;

  // Register once per signed-in session, and again whenever the OS rotates the token.
  useEffect(() => {
    if (!session) return;

    void syncRegistration();

    const rotation = Notifications.addPushTokenListener(() => {
      void syncRegistration();
    });

    // Coming back from the background is when a permission granted in Settings, or a token
    // refreshed while the app slept, actually becomes visible to us.
    const appState = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void syncRegistration();
    });

    return () => {
      rotation.remove();
      appState.remove();
    };
  }, [session]);

  // A notification arriving means the server state moved; refetch rather than trust the payload.
  useEffect(() => {
    if (!session) return;

    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const refillId = Number(data?.['refill_request_id']);

      invalidateRefillData(client, Number.isFinite(refillId) && refillId > 0 ? refillId : undefined);
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
      const target = routeFor(data);
      if (target) routerRef.current.push(target as never);
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [session, client]);
}

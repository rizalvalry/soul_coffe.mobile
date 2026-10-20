import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/store';
import type { Role } from '@/domain/roles';
import { invalidateRefillData } from '@/features/refill/queries';
import { showcaseKeys } from '@/features/showcase/queries';
import { claimEvent } from '@/features/realtime/seen';
import { settlementRoute, settlementTarget } from '@/features/settlements/navigation';
import { invalidateSettlementData } from '@/features/settlements/queries';
import { riderSettlementKey } from '@/features/settlements/rider';
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
  handleNotification: async (notification: Notifications.Notification) => {
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

/**
 * Where a tapped notification should land, by event type.
 *
 * Exported so the in-app notification inbox (`NotificationBell`/`/notifications`) can send a
 * tapped row to the same place a tapped push notification would — one routing decision instead
 * of two that could quietly drift apart.
 */
export function routeFor(data: Record<string, unknown>, role: Role): string | null {
  const type = typeof data['type'] === 'string' ? data['type'] : '';
  if (['SettlementVarianceFlagged', 'SettlementMethodVarianceFlagged', 'SettlementSelfApproved',
    'CartCloseOutVarianceFlagged'].includes(type)) {
    return role === 'FINANCE' || role === 'MANAGEMENT' || role === 'ADMINISTRATOR'
      ? settlementRoute(data) : null;
  }
  if (type === 'RiderClosingRecorded' || type === 'RiderClosingCorrected') {
    // A stored notification may be tapped after its operating date; today's draft is not that result.
    if (role === 'STAFF') return '/menu';
    return role === 'FINANCE' || role === 'MANAGEMENT' || role === 'ADMINISTRATOR'
      ? settlementRoute(data) : null;
  }
  if (type === 'SettlementRecorded' || type === 'SettlementApproved') {
    const riderDate = settlementTarget(data).date;
    return role === 'STAFF' ? `/staff/settlement${riderDate ? `?operating_date=${riderDate}` : ''}`
      : role === 'FINANCE' || role === 'MANAGEMENT' || role === 'ADMINISTRATOR'
        ? settlementRoute(data) : null;
  }

  const refillId = Number(data['refill_request_id']);
  if (Number.isSafeInteger(refillId) && refillId > 0) {
    const status = typeof data['status'] === 'string' ? data['status'] : '';
    switch (role) {
      case 'FINANCE':
      case 'MANAGEMENT':
        return status === 'SUBMITTED' || type === 'RefillRequestSubmitted'
          ? '/finance/approvals' : '/finance/history';
      case 'BARISTA':
        if (status === 'PREPARING' || type === 'RefillPreparingStarted') return '/barista/preparing';
        if (['READY_TO_PICK', 'PICKED_UP', 'DELIVERED', 'CLOSED'].includes(status)) return '/barista/history';
        if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(status)) return `/staff/requests/${refillId}`;
        return '/barista/requests';
      case 'RIDER':
        if (status === 'PICKED_UP' || ['RefillPickedUp', 'DeliveryIncidentReported', 'DeliveryIncidentPartial'].includes(type)) return '/rider/active';
        if (['DELIVERED', 'CLOSED'].includes(status)) return '/rider/history';
        if (['CANCELLED', 'EXPIRED'].includes(status)) return `/staff/requests/${refillId}`;
        return '/rider/available';
      case 'STAFF':
        return `/staff/requests/${refillId}`;
      default:
        return '/menu';
    }
  }

  switch (type) {
    case 'AttendanceClockedIn':
    case 'StaffAttendanceWindowOpened':
      return role === 'STAFF' || role === 'BARISTA' ? '/absen' : '/menu';
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
 * Mounted once, from the authenticated layout. Everything it does is additive to `RealtimeProvider` —
 * if push never arrives (permission denied, no Firebase config, no Play Services) the socket and
 * reconnect, foreground refresh, and pull-to-refresh keep active screens current.
 */
export function usePushNotifications() {
  const router = useRouter();
  const client = useQueryClient();
  const session = useAuth((s) => s.session);
  const lastResponse = Notifications.useLastNotificationResponse();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Register once per signed-in session, and again whenever the OS rotates the token.
  useEffect(() => {
    if (!session) return;

    void syncRegistration(session.token);

    const rotation = Notifications.addPushTokenListener(() => {
      void syncRegistration(session.token);
    });

    // Coming back from the background is when a permission granted in Settings, or a token
    // refreshed while the app slept, actually becomes visible to us.
    const appState = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void syncRegistration(session.token);
    });

    return () => {
      rotation.remove();
      appState.remove();
    };
  }, [session]);

  // A notification arriving means the server state moved; refetch rather than trust the payload.
  useEffect(() => {
    if (!session) return;

    const received = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const refillId = Number(data?.['refill_request_id']);

      invalidateRefillData(client, Number.isFinite(refillId) && refillId > 0 ? refillId : undefined);
      if (data?.['type'] === 'StaffAttendanceWindowOpened' || data?.['type'] === 'AttendanceClockedIn') {
        void client.invalidateQueries({ queryKey: showcaseKeys.absenStatus });
      }
      if (['SettlementVarianceFlagged', 'SettlementMethodVarianceFlagged', 'SettlementSelfApproved',
        'CartCloseOutVarianceFlagged', 'RiderClosingRecorded', 'RiderClosingCorrected'].includes(String(data?.['type'])) &&
        (session.user.role === 'FINANCE' || session.user.role === 'MANAGEMENT' || session.user.role === 'ADMINISTRATOR')) {
        invalidateSettlementData(client, settlementTarget(data ?? {}).cartId);
      }
      if (session.user.role === 'STAFF' && ['SettlementRecorded', 'SettlementApproved'].includes(String(data?.['type']))) {
        void client.invalidateQueries({ queryKey: riderSettlementKey });
      }
    });

    return () => {
      received.remove();
    };
  }, [session, client]);

  // The SDK hook also returns a tap that launched the app before this layout mounted.
  useEffect(() => {
    if (!session || !lastResponse) return;
    const data = (lastResponse.notification.request.content.data ?? {}) as Record<string, unknown>;
    const target = routeFor(data, session.user.role);
    if (target) routerRef.current.push(target as never);
    Notifications.clearLastNotificationResponse();
  }, [session, lastResponse]);
}

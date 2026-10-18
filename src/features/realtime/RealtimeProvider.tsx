import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/store';
import { apiBaseUrl } from '@/lib/api';
import { invalidateRefillData, qk as refillKeys } from '@/features/refill/queries';
import { showcaseKeys } from '@/features/showcase/queries';
import { invalidateSettlementData } from '@/features/settlements/queries';
import { claimEvent } from './seen';
import type { RefillStatus, Role } from '@/domain/types';

// laravel-echo looks for a global Pusher when using the pusher/reverb broadcaster.
(globalThis as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

export type RealtimeEvent = {
  event_id: string;
  type: string;
  refill_request_id: number | null;
  status: RefillStatus | 'ARRIVED' | 'DEPARTED' | null;
  title: string;
  body: string;
  at: string;
  cart_id?: number | null;
};

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/**
 * Mirrors pusher-js's `ChannelAuthorizationData`
 * (node_modules/pusher-js/types/src/core/auth/options.d.ts).
 *
 * Declared structurally instead of imported because pusher-js does not re-export this type from
 * its package root. Typing the callback's second parameter as `unknown` does NOT work: pusher's
 * `ChannelAuthorizerGenerator` puts the callback in a doubly-contravariant position, so a wider
 * parameter type is rejected rather than accepted.
 */
type ChannelAuthData = {
  auth: string;
  channel_data?: string;
  shared_secret?: string;
};

/** Channels a role subscribes to (docs/04 §Realtime). */
function channelsFor(
  role: Role,
  userId: string,
  kitchenId: number | null,
  cartId: number | null,
): string[] {
  const channels = [`user.${userId}`, `role.${role}`];
  if (role === 'BARISTA' && kitchenId) channels.push(`kitchen.${kitchenId}`);
  if (role === 'STAFF' && cartId) channels.push(`cart.${cartId}`);
  return channels;
}

type RealtimeContextValue = {
  state: ConnectionState;
  isRealtime: boolean;
};

const RealtimeContext = createContext<RealtimeContextValue>({ state: 'disconnected', isRealtime: false });

/**
 * Owns the ONE Pusher/Echo connection for the whole authenticated app.
 *
 * This used to live inside `useRealtime()` itself, so every screen that called the hook opened
 * its own socket — harmless while only one such screen was ever mounted at a time, but it also
 * meant the connection existed ONLY while one of those four screens was on screen. A refill
 * approved while the user sat on the menu, on Settings, or anywhere else produced no live signal
 * at all: nothing was subscribed to hear it. Mounted once here, from `(app)/_layout.tsx`, the
 * socket is alive for the whole authenticated session, which is what makes a notification bell
 * (see `NotificationBell`) mean anything outside those four screens.
 *
 * `useRealtimeState()` below is what the four screens now call instead of running their own
 * connection — same `state`/`isRealtime` shape as before, so nothing downstream had to change.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const session = useAuth((s) => s.session);
  const refreshUser = useAuth((s) => s.refreshUser);
  const [state, setState] = useState<ConnectionState>('connecting');

  const echoRef = useRef<Echo<'pusher'> | null>(null);

  useEffect(() => {
    let active = true;
    if (!session) {
      setState('disconnected');
      return;
    }

    const extra = Constants.expoConfig?.extra ?? {};
    const key = extra['pusherKey'] as string | undefined;
    const cluster = extra['pusherCluster'] as string | undefined;

    if (!key || !cluster) {
      // No socket configuration: manual refresh and foreground refresh still work.
      setState('disconnected');
      return;
    }

    let echo: Echo<'pusher'> | null = null;

    try {
      // Pusher Channels is a hosted service (not something this app's own backend runs), so
      // there is no host/port to configure per environment — `key` + `cluster` alone resolve
      // the right regional endpoint (wss://ws-{cluster}.pusher.com), the same pair for local
      // dev and production, as long as both point the Laravel backend's BROADCAST_CONNECTION
      // at the same Pusher app. This replaced self-hosted Reverb specifically because shared
      // hosting here cannot expose a persistent WebSocket process behind a reverse proxy (no
      // supervisor/systemd, and a raw TCP port never reaches the internet) — Pusher's own
      // infrastructure is what actually terminates the socket now.
      echo = new Echo({
        broadcaster: 'pusher',
        key,
        cluster,
        forceTLS: true,
        authorizer: (channel: { name: string }) => ({
          authorize: (
            socketId: string,
            callback: (error: Error | null, data: ChannelAuthData | null) => void,
          ) => {
            fetch(`${apiBaseUrl()}/broadcasting/auth`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
            })
              .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`auth ${r.status}`))))
              .then((data: ChannelAuthData) => callback(null, data))
              .catch((error: Error) => callback(error, null));
          },
        }),
      });
    } catch {
      setState('disconnected');
      return;
    }

    echoRef.current = echo;

    const connector = echo.connector as unknown as {
      pusher?: { connection?: { bind: (e: string, cb: () => void) => void } };
    };
    const connection = connector.pusher?.connection;
    connection?.bind('connected', () => {
      if (!active) return;
      setState('connected');
      // One catch-up refresh per connection. Pusher does not replay events missed offline.
      void client.invalidateQueries();
      if (session.user.role === 'STAFF') void refreshUser().catch(() => {});
    });
    connection?.bind('connecting', () => { if (active) setState('connecting'); });
    connection?.bind('disconnected', () => { if (active) setState('disconnected'); });
    connection?.bind('unavailable', () => { if (active) setState('disconnected'); });
    connection?.bind('failed', () => { if (active) setState('disconnected'); });

    // One event can arrive on several subscribed channels. Keep socket delivery deduplication
    // separate from the shared push/banner claim: FCM may claim the ID before the socket does.
    const handledSocketEventIds = new Set<string>();
    const dispatch = (raw: unknown) => {
      if (!active) return;
      const event = raw as RealtimeEvent;
      if (!event?.event_id || handledSocketEventIds.has(event.event_id)) return;
      handledSocketEventIds.add(event.event_id);
      if (handledSocketEventIds.size > 500) {
        const oldest = handledSocketEventIds.values().next().value;
        if (oldest) handledSocketEventIds.delete(oldest);
      }

      // A socket-first delivery suppresses the later push banner. A push-first delivery still
      // needs the socket's mapped query refreshes, even when both transports share an event ID.
      claimEvent(event.event_id);

      invalidateRefillData(client, event.refill_request_id ?? undefined);

      if (event.type === 'StaffAttendanceWindowOpened' || event.type === 'AttendanceClockedIn') {
        void client.invalidateQueries({ queryKey: showcaseKeys.absenStatus });
        void client.invalidateQueries({ queryKey: ['absen', 'roll'] });
      }
      if (event.type === 'ShowcaseBrewed' || event.type === 'CartStockHandedOver' || event.type === 'CartClosedOut') {
        void client.invalidateQueries({ queryKey: showcaseKeys.stock });
        void client.invalidateQueries({ queryKey: refillKeys.myStock });
        void client.invalidateQueries({ queryKey: refillKeys.kitchenStock });
      }
      if (event.type === 'CartStockHandedOver') {
        void client.invalidateQueries({ queryKey: showcaseKeys.staff });
        void client.invalidateQueries({ queryKey: ['showcase', 'allowance'] });
        void client.invalidateQueries({ queryKey: refillKeys.allocationsToday });
      }
      if (session.user.role === 'STAFF' &&
        (event.type === 'CartAssignmentChanged' || event.type === 'CartStockHandedOver')) {
        if (event.type === 'CartAssignmentChanged') {
          void client.invalidateQueries({ queryKey: refillKeys.myStock });
          if (session.user.cartId && event.cart_id !== session.user.cartId) {
            echo?.leave(`cart.${session.user.cartId}`);
          }
        }
        void refreshUser().catch(() => {});
      }
      const isFinanceOrManagement = session.user.role === 'FINANCE' || session.user.role === 'MANAGEMENT';
      const existingEvent = ['CartClosedOut', 'CartCloseOutVarianceFlagged', 'SaleVoided', 'SaleFlaggedSuspect',
        'RiderClosingRecorded', 'RiderClosingCorrected'].includes(event.type);
      const queueEvent = ['SaleRecorded', 'CartArrivalChanged', 'SettlementRecorded', 'SettlementApproved',
        'SettlementExpectedStale', 'SettlementVarianceFlagged'].includes(event.type);
      if ((isFinanceOrManagement && (existingEvent || queueEvent)) ||
        (session.user.role === 'ADMINISTRATOR' && existingEvent)) {
        invalidateSettlementData(client, event.cart_id);
      }
    };

    const names = channelsFor(
      session.user.role,
      session.user.id,
      session.user.kitchenId ?? null,
      session.user.cartId ?? null,
    );

    for (const name of names) {
      echo.private(name).listen('.soul.event', dispatch);
    }

    return () => {
      active = false;
      for (const name of names) echo?.leave(name);
      echo?.disconnect();
      echoRef.current = null;
    };
  }, [session, client, refreshUser]);

  // React Query's window-focus signal is not reliable on native. Refresh active queries when
  // the app returns, including events missed while the socket was disconnected.
  useEffect(() => {
    if (!session) return;
    let previous: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && previous !== 'active') {
        void client.invalidateQueries();
        if (session.user.role === 'STAFF') void refreshUser().catch(() => {});
      }
      previous = next;
    });
    return () => subscription.remove();
  }, [session, client, refreshUser]);

  // A window opened yesterday is closed at the server's next operating-day boundary, even if
  // the phone stays foregrounded with a healthy socket (no event is emitted for that rollover).
  // Schedule a single refresh at each plausible boundary: Laravel defaults to UTC and operations
  // run in WIB. These are date-change triggers, not an interval that polls for an open window.
  useEffect(() => {
    if (session?.user.role !== 'STAFF') return;
    let timer: ReturnType<typeof setTimeout>;
    const day = 24 * 60 * 60 * 1000;
    const wibOffset = 7 * 60 * 60 * 1000;
    const schedule = () => {
      const now = Date.now();
      const nextUtc = (Math.floor(now / day) + 1) * day;
      const nextWib = (Math.floor((now + wibOffset) / day) + 1) * day - wibOffset;
      timer = setTimeout(() => {
        void client.invalidateQueries({ queryKey: showcaseKeys.absenStatus });
        void refreshUser().catch(() => {});
        schedule();
      }, Math.min(nextUtc, nextWib) - now + 1000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [session?.user.role, client, refreshUser]);

  return <RealtimeContext.Provider value={{ state, isRealtime: state === 'connected' }}>{children}</RealtimeContext.Provider>;
}

/**
 * What the four business screens read instead of opening their own connection.
 *
 * Same shape `useRealtime()` used to return (`state`, `isRealtime`) so ConnectionBanner and the
 * rider requests header needed no changes beyond the import.
 */
export function useRealtimeState(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/store';
import { apiBaseUrl } from '@/lib/api';
import { invalidateRefillData } from '@/features/refill/queries';
import { claimEvent } from './seen';
import type { RefillStatus, Role } from '@/domain/types';

// laravel-echo looks for a global Pusher when using the pusher/reverb broadcaster.
(globalThis as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

export type RealtimeEvent = {
  event_id: string;
  type: string;
  refill_request_id: number | null;
  status: RefillStatus | null;
  title: string;
  body: string;
  at: string;
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

/**
 * Realtime layer for requirement 3 — updates without a reload.
 *
 * Two things worth knowing before changing this:
 *
 * 1. **Dedupe by `event_id`.** The same event can arrive over the WebSocket and again as a push
 *    notification (E15). The seen-set lives in `./seen` rather than in this hook, because the push
 *    handler is not a hook and can fire with nothing mounted — a set owned here would be rebuilt on
 *    every remount and would miss exactly the overlap it exists to catch.
 *
 * 2. **The polling fallback is a safety net, not the mechanism.** When the socket is down the
 *    app refetches every 10 s so a demo on a hostile network still works, but requirement 3 is
 *    only satisfied when `state === 'connected'`. The UI shows which mode it is in — silently
 *    degrading to polling while claiming to be realtime would be a lie to the operator.
 */
export function useRealtime(onEvent?: (event: RealtimeEvent) => void) {
  const client = useQueryClient();
  const session = useAuth((s) => s.session);
  const [state, setState] = useState<ConnectionState>('connecting');

  const echoRef = useRef<Echo<'pusher'> | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!session) {
      setState('disconnected');
      return;
    }

    const extra = Constants.expoConfig?.extra ?? {};
    const key = extra['pusherKey'] as string | undefined;
    const cluster = extra['pusherCluster'] as string | undefined;

    if (!key || !cluster) {
      // Nothing to connect to — degrade to the polling fallback below rather than throwing.
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
    connection?.bind('connected', () => setState('connected'));
    connection?.bind('connecting', () => setState('connecting'));
    connection?.bind('disconnected', () => setState('disconnected'));
    connection?.bind('unavailable', () => setState('disconnected'));
    connection?.bind('failed', () => setState('disconnected'));

    const dispatch = (raw: unknown) => {
      const event = raw as RealtimeEvent;
      if (!event?.event_id) return;

      // First arrival wins. If the push got here first, the screen is already being refreshed and
      // this copy is dropped; if this got here first, the push's foreground banner is suppressed.
      if (!claimEvent(event.event_id)) return;

      invalidateRefillData(client, event.refill_request_id ?? undefined);
      handlerRef.current?.(event);
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
      for (const name of names) echo?.leave(name);
      echo?.disconnect();
      echoRef.current = null;
    };
  }, [session, client]);

  // One catch-up refetch the moment the socket comes up.
  //
  // Events that fired while it was down were broadcast to nobody — Pusher has no replay on
  // subscribe, and the outbox is a delivery log, not a mailbox the client can read back. Without
  // this, a reconnect would leave the screen showing whatever it held before the drop until the
  // next event happened to arrive. This is the poll's actual job, done once instead of forever.
  useEffect(() => {
    if (state !== 'connected') return;
    invalidateRefillData(client);
  }, [state, client]);

  // Fallback refetch while the socket is NOT up. Never runs alongside the socket: the guard below
  // means the timer is torn down the instant `connected` arrives, so a working Pusher connection
  // costs zero polling requests. It exists for the case where the socket genuinely cannot be
  // established — no key configured, a captive-portal network — where the alternative is a screen
  // that silently stops updating.
  useEffect(() => {
    if (state === 'connected' || !session) return;
    const timer = setInterval(() => invalidateRefillData(client), 10_000);
    return () => clearInterval(timer);
  }, [state, session, client]);

  return { state, isRealtime: state === 'connected' };
}

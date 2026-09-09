import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import { request } from '@/lib/api';
import { useAuth } from '@/features/auth/store';
import { deviceLabel } from '@/features/push/device';

/**
 * Reports where this phone is, so the CMS can show where each cart is.
 *
 * WHAT THIS DOES, PRECISELY — AND WHAT IT DOES NOT
 * ------------------------------------------------
 * It reports while the app is OPEN and in the FOREGROUND, roughly once a minute, for staff
 * accounts only. It does not track anyone in the background: that needs a foreground service, a
 * second Android permission with its own scary dialog, and a persistent notification, and none of
 * that was asked for. So the honest description of the trail is "where the cart was while the app
 * was in someone's hand", plus a precise point at every sale (the server records one from the
 * transaction's own coordinates).
 *
 * The gap that leaves is real and worth naming: a phone in a pocket for two hours contributes
 * nothing but the sales made in that time. If continuous tracking is wanted later, this is the
 * file that grows a TaskManager task — nothing else needs to change, because the server already
 * accepts a batch of queued fixes.
 *
 * STAFF ONLY
 * ----------
 * A barista stands in a kitchen and a rider's route is not part of a cart's day. Reporting
 * everyone's position because the code would be identical is surveillance with no question
 * behind it.
 *
 * NEVER IN THE WAY
 * ----------------
 * Every failure here is swallowed. A denied permission, a phone with location switched off, a
 * dead network: the app carries on exactly as before, one screen less informative in the CMS.
 * This is the same rule E10 applies everywhere else — GPS is evidence, never a gate.
 */

/** Fallback until the server says otherwise in its response. */
const DEFAULT_INTERVAL_SECONDS = 60;

/**
 * Cap on the offline queue. Held in memory only: a trail that survived a force-quit would be
 * reporting positions from an hour ago as if they were current, and the server stamps its own
 * clock on arrival.
 */
const MAX_QUEUED = 30;

type QueuedPing = {
  lat: number;
  lng: number;
  accuracy_m?: number;
  captured_at: string;
};

export function useLocationReporter(): void {
  const role = useAuth((s) => s.session?.user.role);
  const isStaff = role === 'STAFF';

  const queue = useRef<QueuedPing[]>([]);
  const intervalSeconds = useRef(DEFAULT_INTERVAL_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isStaff) return;

    let cancelled = false;
    let granted = false;

    const flush = async (): Promise<void> => {
      if (inFlight.current || queue.current.length === 0) return;

      inFlight.current = true;
      const batch = queue.current.slice(0, MAX_QUEUED);

      try {
        const response = await request<{ recorded: number; min_interval_seconds: number }>(
          '/me/location',
          // The handset's own name, the same label the push registration sends — enough to tell
          // two devices apart in the panel without collecting an identifier of its own.
          { method: 'POST', body: { pings: batch, device_id: deviceLabel() } },
        );

        // Sent successfully, so drop exactly what was sent — not the whole queue, which may have
        // grown while the request was in flight.
        queue.current = queue.current.slice(batch.length);

        // The reporting interval is a server decision. That way it can be tuned for a busy month
        // without shipping an APK, and this build has no opinion to become stale.
        if (response?.min_interval_seconds > 0) {
          const next = response.min_interval_seconds;

          if (next !== intervalSeconds.current) {
            intervalSeconds.current = next;
            restart();
          }
        }
      } catch {
        // Keep the batch queued for the next tick. A day of driving through dead spots is the
        // case this queue exists for.
      } finally {
        inFlight.current = false;
      }
    };

    const capture = async (): Promise<void> => {
      if (!granted || AppState.currentState !== 'active') return;

      try {
        const position = await Location.getCurrentPositionAsync({
          // Balanced, not Highest: a cart's position to within a few tens of metres answers
          // every question this feature asks, and the highest setting is the one that empties a
          // battery over a ten-hour shift.
          accuracy: Location.LocationAccuracy.Balanced,
        });

        const { latitude, longitude, accuracy } = position.coords;

        // A phone that has just woken sometimes reports (0,0) before its first real fix. The
        // server drops those too; not sending them saves a pointless request.
        if (latitude === 0 && longitude === 0) return;

        queue.current = [
          ...queue.current,
          {
            lat: latitude,
            lng: longitude,
            ...(typeof accuracy === 'number' && accuracy >= 0 ? { accuracy_m: Math.round(accuracy) } : {}),
            captured_at: new Date().toISOString(),
          },
        ].slice(-MAX_QUEUED);

        await flush();
      } catch {
        // No fix this minute. There will be another one.
      }
    };

    const restart = (): void => {
      if (timer.current) clearInterval(timer.current);
      if (cancelled) return;
      timer.current = setInterval(() => void capture(), intervalSeconds.current * 1000);
    };

    const onAppStateChange = (state: AppStateStatus): void => {
      // Coming back to the foreground is the most interesting moment there is: the phone has
      // probably moved since the last report, and anything still queued can go now.
      if (state === 'active') {
        void capture();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);

    (async () => {
      try {
        const existing = await Location.getForegroundPermissionsAsync();

        granted = existing.granted
          ? true
          : existing.canAskAgain
            ? (await Location.requestForegroundPermissionsAsync()).granted
            : false;
      } catch {
        granted = false;
      }

      if (cancelled || !granted) return;

      await capture();
      restart();
    })();

    return () => {
      cancelled = true;
      subscription.remove();
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [isStaff]);
}

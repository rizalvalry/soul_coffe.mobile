import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';

import { qk as refillKeys } from '@/features/refill/queries';
import { showcaseKeys } from '@/features/showcase/queries';
import { useAttendanceStatus } from '@/features/showcase/queries';
import { riderDayGate, shouldResumeQueuedSales } from '@/features/showcase/riderDayGate';
import { useAuth } from '@/features/auth/store';
import {
  enqueueSale,
  flushSalesQueue,
  legacyQueuedSaleCount,
  loadQueuedSales,
  type QueuedSale,
} from './offlineQueue';
import { salesKeys } from './queries';
import type { RecordSaleInput } from './queries';
import type { AttendanceStatus } from '@/domain/types';

/**
 * Wires the offline sales queue into one screen: loads it, flushes it the moment the network
 * comes back, and keeps the rest of the app's caches (today's sales, cart stock, the kitchen
 * total) in step with whatever the queue actually managed to send.
 *
 * A single hook rather than spreading AsyncStorage calls through the screen, for the same reason
 * every other feature folder here keeps its data access in one queries/service file: the screen
 * should only ever say WHAT it wants (queue this, show me what's pending), never HOW the queue is
 * persisted or retried.
 */
export function useOfflineSalesQueue() {
  const client = useQueryClient();
  const ownerId = useAuth((s) => s.session?.user.id ?? null);
  const attendance = useAttendanceStatus();
  const gate = riderDayGate(attendance.data);
  const gateRef = useRef({ gate, pending: attendance.isPending });
  gateRef.current = { gate, pending: attendance.isPending };
  const blockedByDayRef = useRef(false);
  const blockedStatusUpdatedAtRef = useRef(0);
  const immediateRetryAvailableRef = useRef(true);
  const previousGateRef = useRef(gate);

  const [queueState, setQueueState] = useState<{ ownerId: string | null; entries: QueuedSale[] }>({ ownerId: null, entries: [] });
  const entries = queueState.ownerId === ownerId ? queueState.entries : [];
  const queue = entries.filter((entry) => !entry.rejection);
  const rejected = entries.filter((entry) => !!entry.rejection);
  const [legacyCount, setLegacyCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [lastFailure, setLastFailure] = useState<string | null>(null);

  // Guards against two triggers (a NetInfo event and the screen's own mount, say) racing to
  // flush the same queue at once — the server-side idempotency key makes a double-flush safe,
  // but there is no reason to spend two round trips confirming that.
  const flushingRef = useRef<string | null>(null);

  const invalidateAfterSync = useCallback(() => {
    void client.invalidateQueries({ queryKey: salesKeys.today });
    void client.invalidateQueries({ queryKey: refillKeys.myStock });
    void client.invalidateQueries({ queryKey: showcaseKeys.stock });
  }, [client]);

  const flush = useCallback(async (force = false): Promise<void> => {
    if (!ownerId || useAuth.getState().session?.user.id !== ownerId) return;
    if (gateRef.current.pending || gateRef.current.gate === 'closed' ||
      gateRef.current.gate === 'attendance' || (blockedByDayRef.current && !force)) return;
    if (flushingRef.current === ownerId) return;

    flushingRef.current = ownerId;
    setFlushing(true);
    let retryAfterRefresh = false;

    try {
      const result = await flushSalesQueue(ownerId);

      if (useAuth.getState().session?.user.id !== ownerId) return;

      if (result.synced.length > 0 || result.failed.length > 0) {
        invalidateAfterSync();
      }

      const lastRejection = result.failed.at(-1);

      if (result.waitingForGate) {
        blockedByDayRef.current = true;
        blockedStatusUpdatedAtRef.current = Number.MAX_SAFE_INTEGER;
        setLastFailure(result.waitingForGate);
        const beforeRefresh = client.getQueryState(showcaseKeys.absenStatus)?.dataUpdatedAt ?? 0;
        try {
          await client.invalidateQueries({ queryKey: showcaseKeys.absenStatus });
        } catch {
          // The pending sale remains on disk. A later fresh status can release this hold.
        }
        const refreshedAt = client.getQueryState(showcaseKeys.absenStatus)?.dataUpdatedAt ?? 0;
        blockedStatusUpdatedAtRef.current = refreshedAt;
        if (immediateRetryAvailableRef.current && refreshedAt > beforeRefresh &&
          riderDayGate(client.getQueryData<AttendanceStatus>(showcaseKeys.absenStatus)) === 'ready') {
          // A clock-in can race the 422. Retry once after releasing the current flush lock;
          // if the server still refuses, wait for another status change instead of looping.
          immediateRetryAvailableRef.current = false;
          blockedByDayRef.current = false;
          retryAfterRefresh = true;
        }
      } else if (result.synced.length > 0) {
        blockedByDayRef.current = false;
        setLastFailure(null);
      }

      if (lastRejection && !result.waitingForGate) {
        // Surfaced as the most recent rejection's own sentence — the same "the server's message
        // is more useful than anything invented here" rule this screen already follows online.
        setLastFailure(lastRejection.message);
      }

      setQueueState({ ownerId, entries: await loadQueuedSales(ownerId) });
    } catch {
      if (useAuth.getState().session?.user.id === ownerId) {
        setLastFailure('Antrean offline tidak dapat disimpan atau dibaca. Data lama tetap disimpan di perangkat.');
      }
    } finally {
      if (flushingRef.current === ownerId) flushingRef.current = null;
      if (useAuth.getState().session?.user.id === ownerId) setFlushing(false);
    }
    if (retryAfterRefresh && useAuth.getState().session?.user.id === ownerId) void flush();
  }, [invalidateAfterSync, ownerId, client]);

  // Load whatever survived from a previous session, then try sending it immediately — the
  // common case is a phone that regained signal while the app was closed.
  useEffect(() => {
    let cancelled = false;
    setQueueState({ ownerId, entries: [] });
    setLastFailure(null);
    blockedByDayRef.current = false;
    blockedStatusUpdatedAtRef.current = 0;
    immediateRetryAvailableRef.current = true;
    setFlushing(false);
    setLegacyCount(0);
    if (!ownerId) return;

    (async () => {
      try {
        const [initial, oldCount] = await Promise.all([loadQueuedSales(ownerId), legacyQueuedSaleCount()]);
        if (cancelled || useAuth.getState().session?.user.id !== ownerId) return;
        setQueueState({ ownerId, entries: initial });
        setLegacyCount(oldCount);
        if (initial.some((entry) => !entry.rejection)) void flush();
      } catch {
        if (!cancelled) setLastFailure('Antrean offline tidak dapat dibaca. Data lama tetap disimpan di perangkat.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerId, flush]);

  // The realtime open event, clock-in, reconnect, and foreground refresh all update this query.
  // A held DAY_NOT_OPEN sale is retried only after the server reports an open, attended day.
  useEffect(() => {
    const previous = previousGateRef.current;
    previousGateRef.current = gate;
    const resume = shouldResumeQueuedSales(
      previous,
      gate,
      attendance.dataUpdatedAt,
      blockedByDayRef.current ? blockedStatusUpdatedAtRef.current : Number.MAX_SAFE_INTEGER,
    );
    if (resume) {
      blockedByDayRef.current = false;
      blockedStatusUpdatedAtRef.current = 0;
      if (previous !== 'ready') immediateRetryAvailableRef.current = true;
      setLastFailure(null);
      void flush();
    } else if (gate === 'legacy' && !attendance.isPending) {
      void flush();
    }
  }, [gate, attendance.isPending, attendance.dataUpdatedAt, flush]);

  // The moment the phone reports a connection again, try the queue — this is the whole point of
  // queuing rather than just failing the sale: the retry should need nobody to remember to do
  // anything.
  useEffect(() => {
    const subscription = NetInfo.addEventListener((state) => {
      if (state.isConnected) void flush();
    });

    return () => subscription();
  }, [flush]);

  const enqueue = useCallback(
    async (input: RecordSaleInput): Promise<QueuedSale> => {
      if (!ownerId) throw new Error('Sesi berakhir. Masuk kembali.');
      const entry = await enqueueSale(ownerId, input);
      if (useAuth.getState().session?.user.id === ownerId) {
        setQueueState((prev) => ({ ownerId, entries: [...(prev.ownerId === ownerId ? prev.entries : []), entry] }));
      }
      // Try at once in case the phone actually has a connection and the earlier attempt failed
      // for some other transient reason — no reason to make a good connection wait.
      void flush();
      return entry;
    },
    [flush, ownerId],
  );

  return {
    /** Sales still waiting to leave this phone. */
    queue,
    rejected,
    /** Whether a sale is currently on this phone only, not yet confirmed by the server. */
    hasQueued: queue.length > 0,
    legacyCount,
    flushing,
    /** The most recent rejection's message; the rejected entry remains stored. Caller clears it. */
    lastFailure,
    clearLastFailure: () => setLastFailure(null),
    enqueue,
    flushNow: () => flush(true),
  };
}

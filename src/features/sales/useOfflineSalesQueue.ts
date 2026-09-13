import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';

import { qk as refillKeys } from '@/features/refill/queries';
import { showcaseKeys } from '@/features/showcase/queries';
import {
  enqueueSale,
  flushSalesQueue,
  loadQueuedSales,
  type QueuedSale,
} from './offlineQueue';
import { salesKeys } from './queries';
import type { RecordSaleInput } from './queries';

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

  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [lastFailure, setLastFailure] = useState<string | null>(null);

  // Guards against two triggers (a NetInfo event and the screen's own mount, say) racing to
  // flush the same queue at once — the server-side idempotency key makes a double-flush safe,
  // but there is no reason to spend two round trips confirming that.
  const flushingRef = useRef(false);

  const invalidateAfterSync = useCallback(() => {
    void client.invalidateQueries({ queryKey: salesKeys.today });
    void client.invalidateQueries({ queryKey: refillKeys.myStock });
    void client.invalidateQueries({ queryKey: showcaseKeys.stock });
  }, [client]);

  const flush = useCallback(async (): Promise<void> => {
    if (flushingRef.current) return;

    flushingRef.current = true;
    setFlushing(true);

    try {
      const result = await flushSalesQueue();

      if (result.synced.length > 0 || result.failed.length > 0) {
        invalidateAfterSync();
      }

      const lastRejection = result.failed.at(-1);

      if (lastRejection) {
        // Surfaced as the most recent rejection's own sentence — the same "the server's message
        // is more useful than anything invented here" rule this screen already follows online.
        setLastFailure(lastRejection.message);
      }

      setQueue(await loadQueuedSales());
    } finally {
      flushingRef.current = false;
      setFlushing(false);
    }
  }, [invalidateAfterSync]);

  // Load whatever survived from a previous session, then try sending it immediately — the
  // common case is a phone that regained signal while the app was closed.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const initial = await loadQueuedSales();
      if (cancelled) return;
      setQueue(initial);
      if (initial.length > 0) void flush();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const entry = await enqueueSale(input);
      setQueue((prev) => [...prev, entry]);
      // Try at once in case the phone actually has a connection and the earlier attempt failed
      // for some other transient reason — no reason to make a good connection wait.
      void flush();
      return entry;
    },
    [flush],
  );

  return {
    /** Sales still waiting to leave this phone. */
    queue,
    /** Whether a sale is currently on this phone only, not yet confirmed by the server. */
    hasQueued: queue.length > 0,
    flushing,
    /** The most recent rejection's message, if the last flush dropped an entry. Caller clears it. */
    lastFailure,
    clearLastFailure: () => setLastFailure(null),
    enqueue,
    flushNow: flush,
  };
}

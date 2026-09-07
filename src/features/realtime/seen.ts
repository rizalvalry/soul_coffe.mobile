/**
 * One dedupe set shared by both delivery paths (E15).
 *
 * The same server event arrives twice by design: once over the Pusher socket and once as an FCM
 * push. `event_id` is the server's key for that pair (EventPublisher mints one per event and puts
 * it in both), so whichever arrives first claims it and the second is a no-op.
 *
 * This lives outside `RealtimeProvider` because the push handler is not a React hook and can fire while
 * no component is mounted. A set owned by a hook would be recreated on every remount and would
 * miss exactly the overlap it exists to catch.
 */

const seen = new Set<string>();

/** Bounded so a long shift cannot grow this without limit. */
const MAX = 500;
const KEEP = 250;

/** Returns true the FIRST time an event id is presented, false for every repeat. */
export function claimEvent(eventId: string | null | undefined): boolean {
  if (!eventId) return true; // nothing to dedupe on — never swallow it

  if (seen.has(eventId)) return false;

  seen.add(eventId);

  if (seen.size > MAX) {
    const recent = [...seen].slice(-KEEP);
    seen.clear();
    for (const id of recent) seen.add(id);
  }

  return true;
}

/** Sign-out: the next user on this device starts with a clean set. */
export function resetSeenEvents(): void {
  seen.clear();
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/features/auth/store';
import { useKitchenSelection } from './kitchenSelection';
import { uuidv4 } from '@/lib/api';

type Pending = { fingerprint: string; key: string };
const pending = new Map<string, Promise<Pending>>();

function identity(path: string, body: unknown): { slot: string; fingerprint: string } {
  const userId = useAuth.getState().session?.user.id ?? 'unknown';
  const kitchenId = useKitchenSelection.getState().kitchenId;
  const fingerprint = JSON.stringify({ kitchenId, body });
  return {
    slot: `soul.pendingKitchenWrite.v1.${userId}.${path}.${encodeURIComponent(fingerprint)}`,
    fingerprint,
  };
}

/** Keep the same server idempotency key after a lost response, including an app restart. */
export async function kitchenOperationKey(path: string, body: unknown): Promise<{ key: string; clear: () => Promise<void> }> {
  const { slot, fingerprint } = identity(path, body);
  const previous = pending.get(slot) ?? AsyncStorage.getItem(slot).then((raw): Pending | null => {
    if (!raw) return null;
    try { return JSON.parse(raw) as Pending; } catch { return null; }
  });
  const next = previous.then(async (entry) => {
    if (entry?.fingerprint === fingerprint) return entry;
    const created = { fingerprint, key: uuidv4() };
    await AsyncStorage.setItem(slot, JSON.stringify(created));
    return created;
  });
  pending.set(slot, next);
  const entry = await next;
  return { key: entry.key, clear: async () => {
    if ((await pending.get(slot))?.key !== entry.key) return;
    pending.delete(slot);
    await AsyncStorage.removeItem(slot);
  } };
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import { uuidv4 } from '@/lib/api';
import type { ClearingInput } from './queries';

const prefix = 'soul.clearing.attempt.v1';

function key(ownerId: string): string {
  if (!ownerId) throw new Error('Sesi Finance belum siap. Coba masuk lagi ya.');
  return `${prefix}.${encodeURIComponent(ownerId)}`;
}

export async function readClearingAttempt(ownerId: string): Promise<ClearingInput | null> {
  const raw = await AsyncStorage.getItem(key(ownerId));
  if (!raw) return null;
  const data = JSON.parse(raw) as ClearingInput;
  if (typeof data.uuid !== 'string' || typeof data.received_on !== 'string'
    || !Number.isSafeInteger(data.amount_minor) || !Number.isSafeInteger(data.mdr_minor)
    || !Number.isSafeInteger(data.bank_account_id) || !Array.isArray(data.sale_dates)) {
    throw new Error('Draft dana masuk belum bisa dibaca. Coba lagi ya.');
  }
  return data;
}

export async function loadOrCreateClearingAttempt(ownerId: string, input: Omit<ClearingInput, 'uuid'>): Promise<ClearingInput> {
  const existing = await readClearingAttempt(ownerId);
  if (existing) return existing;
  const attempt = { ...input, uuid: uuidv4() };
  await AsyncStorage.setItem(key(ownerId), JSON.stringify(attempt));
  return attempt;
}

export async function clearClearingAttempt(ownerId: string): Promise<void> {
  await AsyncStorage.removeItem(key(ownerId));
}

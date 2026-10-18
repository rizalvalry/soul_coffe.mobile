import AsyncStorage from '@react-native-async-storage/async-storage';

import { uuidv4 } from '@/lib/api';
import type { RecordSettlementInput } from './queries';

type DraftInput = Omit<RecordSettlementInput, 'idempotencyKey'>;

const PREFIX = 'soul.settlement.draft.v1';

function storageKey(ownerId: string, cartId: number, date?: string): string {
  if (!ownerId) throw new Error('Sesi Finance belum siap. Coba masuk lagi ya.');
  // The API's default operating day uses the server's UTC date. A new day gets a new draft.
  const day = date ?? new Date().toISOString().slice(0, 10);
  return `${PREFIX}.${encodeURIComponent(ownerId)}.${cartId}.${day}`;
}

function validMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000;
}

function parseAttempt(raw: string, cartId: number, date?: string): RecordSettlementInput {
  let attempt: Partial<RecordSettlementInput>;
  try {
    attempt = JSON.parse(raw) as Partial<RecordSettlementInput>;
  } catch {
    throw new Error('Draft setoran di perangkat belum bisa dibaca. Coba lagi ya.');
  }
  if (!attempt || typeof attempt.idempotencyKey !== 'string' || !attempt.idempotencyKey
    || attempt.cartId !== cartId || attempt.date !== date
    || !validMoney(attempt.cash) || !validMoney(attempt.qris) || !validMoney(attempt.transfer)
    || (attempt.varianceReason !== undefined && typeof attempt.varianceReason !== 'string')) {
    throw new Error('Draft setoran di perangkat belum bisa dibaca. Coba lagi ya.');
  }
  return attempt as RecordSettlementInput;
}

export async function readSettlementAttempt(ownerId: string, cartId: number, date?: string): Promise<RecordSettlementInput | null> {
  const raw = await AsyncStorage.getItem(storageKey(ownerId, cartId, date));
  return raw ? parseAttempt(raw, cartId, date) : null;
}

/** Persist before sending: a lost response, modal close, or app restart must reuse this body and key. */
export async function loadOrCreateSettlementAttempt(ownerId: string, input: DraftInput): Promise<RecordSettlementInput> {
  const existing = await readSettlementAttempt(ownerId, input.cartId, input.date);
  if (existing) return existing;

  const attempt = { ...input, idempotencyKey: uuidv4() };
  await AsyncStorage.setItem(storageKey(ownerId, input.cartId, input.date), JSON.stringify(attempt));
  return attempt;
}

export async function clearSettlementAttempt(ownerId: string, cartId: number, date?: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(ownerId, cartId, date));
}

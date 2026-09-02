import Constants from 'expo-constants';
import { useAuth } from '@/features/auth/store';
import { isDemoMode } from '@/features/demo/config';
import { demoRequest, demoUpload } from '@/features/demo/router';
import { DemoError } from '@/features/demo/store';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 409 means a state guard refused the transition — the most important error in this app. */
  get isConflict() {
    return this.status === 409;
  }

  get isValidation() {
    return this.status === 422;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isOffline() {
    return this.status === 0;
  }
}

/** `demo/store.ts` throws `DemoError` — it never imports this file (see that class's docblock
 * for why), so the demo router hands us a plain error we translate into the real `ApiError`
 * every screen already knows how to handle. */
function rethrowAsApiError(e: unknown): never {
  if (e instanceof DemoError) throw new ApiError(e.message, e.status);
  throw e;
}

export function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined;
  if (!url) throw new ApiError('apiBaseUrl belum diisi di app.json', 0);
  return url;
}

/**
 * RFC 4122 v4 via Math.random.
 *
 * Adequate here because these UUIDs are DEDUPLICATION keys, not secrets: the server pairs them
 * with the authenticated user, so a collision or a guess grants nothing. Anything needing
 * unpredictability must use expo-crypto instead.
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sent as Idempotency-Key. Required by the server on every state transition (R12). */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record['message'] === 'string' && record['message']) {
      return record['message'];
    }
    // Laravel validation shape: { errors: { field: [msg] } }
    const errors = record['errors'];
    if (errors && typeof errors === 'object') {
      const first = Object.values(errors as Record<string, unknown>)[0];
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
  }
  if (status === 0) return 'Tidak ada koneksi. Data akan dikirim saat online.';
  if (status === 403) return 'Anda tidak memiliki akses untuk tindakan ini.';
  if (status === 409) return 'Status permintaan sudah berubah. Muat ulang halaman.';
  if (status >= 500) return `Server bermasalah (${status}). Coba lagi nanti.`;
  return `Permintaan gagal (${status}).`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, signal } = options;

  // Demo mode (see features/demo/config.ts) never touches the network — every hook in
  // features/refill/queries.ts calls this same function unmodified either way.
  if (isDemoMode()) {
    try {
      return await demoRequest<T>(method, path, body, idempotencyKey);
    } catch (e) {
      if (e instanceof DemoError && e.status === 401) void useAuth.getState().signOut();
      rethrowAsApiError(e);
    }
  }

  const token = useAuth.getState().session?.token;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new ApiError('Tidak ada koneksi ke server.', 0);
  }

  const parsed = await parseBody(response);

  if (response.status === 401) {
    // The token is gone or revoked. Drop the session so the UI returns to login rather than
    // looping on 401s behind every screen.
    void useAuth.getState().signOut();
    throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 401, parsed);
  }

  if (!response.ok) {
    throw new ApiError(messageFrom(parsed, response.status), response.status, parsed);
  }

  // The API wraps payloads as { data: ... }; unwrap so callers deal in domain objects.
  if (parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)) {
    return (parsed as { data: T }).data;
  }
  return parsed as T;
}

/** The HTTP status matters for at least one transition: `deliver` answers 202 when the stock
 *  ledger post is being retried rather than 200 with a closed request (E19). Callers that need
 *  to tell those apart use the `*WithStatus` variants; everything else keeps the plain shape. */
export type ApiResult<T> = { data: T; status: number };

/**
 * Multipart upload for the evidence photo (R3) and the delivery signature (R5).
 *
 * `fieldName` matters: `/media/evidence` expects the part to be called `file`, but
 * `/refills/{id}/deliver` expects `signature` (docs/04). Hardcoding `file` made every delivery
 * fail with `422 The signature field is required` — a break only an end-to-end run catches,
 * because unit tests post the correct field name directly.
 */
export async function uploadFile<T>(
  path: string,
  file: { uri: string; name: string; type: string },
  fields: Record<string, string> = {},
  fieldName = 'file',
): Promise<T> {
  return (await uploadFileWithStatus<T>(path, file, fields, fieldName)).data;
}

export async function uploadFileWithStatus<T>(
  path: string,
  file: { uri: string; name: string; type: string },
  fields: Record<string, string> = {},
  fieldName = 'file',
): Promise<ApiResult<T>> {
  if (isDemoMode()) {
    try {
      return await demoUpload<T>(path, file, fields);
    } catch (e) {
      rethrowAsApiError(e);
    }
  }

  const token = useAuth.getState().session?.token;

  const form = new FormData();
  // React Native's FormData accepts this shape; it is not the browser File API.
  form.append(fieldName, file as unknown as Blob);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, { method: 'POST', headers, body: form });
  } catch {
    throw new ApiError('Upload gagal. Periksa koneksi.', 0);
  }

  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(messageFrom(parsed, response.status), response.status, parsed);
  }

  const data =
    parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)
      ? (parsed as { data: T }).data
      : (parsed as T);

  return { data, status: response.status };
}

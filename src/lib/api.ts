import Constants from 'expo-constants';
import { File, UploadTask, UploadType } from 'expo-file-system';
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

/** Transport-level upload attempts. The body is a real file on disk, so a retry re-sends
 *  identical bytes — see `uploadFileWithStatus()` for why that is safe here. */
const UPLOAD_ATTEMPTS = 3;

function uploadRetryDelay(attempt: number): number {
  return 800 * 2 ** attempt; // 800ms, 1.6s
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Multipart upload for the evidence photo (R3) and the delivery signature (R5).
 *
 * `fieldName` matters: `/media/evidence` expects the part to be called `file`, but
 * `/refills/{id}/deliver` expects `signature` (docs/04). Hardcoding `file` made every delivery
 * fail with `422 The signature field is required` — a break only an end-to-end run catches,
 * because unit tests post the correct field name directly.
 *
 * This does NOT use `fetch` + `FormData`, and that is deliberate. React Native's Android
 * multipart encoder derives each file part's `Content-Length` from `InputStream.available()`
 * (`RequestBodyUtil.kt`) — a guess, not the file size, as React Native's own comment in
 * `ProgressRequestBody.kt` admits — and marks the part `isOneShot`, so OkHttp may not replay it.
 * A body whose declared length can disagree with what is actually written, on a connection that
 * cannot be retried, fails routinely on a cellular uplink: the server tears the connection down
 * and `fetch` rejects with no HTTP status at all. That is what surfaced to staff as the opaque
 * "Upload gagal. Periksa koneksi." while the very same request succeeded from cURL every time.
 *
 * `UploadTask` streams the file natively instead: an exact `Content-Length` taken from the file
 * on disk, a replayable body, and — critically for diagnosis — it RESOLVES on every completed
 * HTTP response including 4xx/5xx, so a validation failure now arrives as its real message
 * rather than being mistaken for a dead network.
 */
export async function uploadFile<T>(
  path: string,
  file: { uri: string; name: string; type: string },
  fields: Record<string, string> = {},
  fieldName = 'file',
  idempotencyKey?: string,
): Promise<T> {
  return (await uploadFileWithStatus<T>(path, file, fields, fieldName, idempotencyKey)).data;
}

export async function uploadFileWithStatus<T>(
  path: string,
  file: { uri: string; name: string; type: string },
  fields: Record<string, string> = {},
  fieldName = 'file',
  idempotencyKey?: string,
): Promise<ApiResult<T>> {
  if (isDemoMode()) {
    try {
      return await demoUpload<T>(path, file, fields);
    } catch (e) {
      rethrowAsApiError(e);
    }
  }

  const token = useAuth.getState().session?.token;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Every state transition the server guards with `idempotent:require` (R12) — `/deliver` is
  // one — rejects a request without this header, multipart included.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const url = `${apiBaseUrl()}${path}`;
  let lastTransportError: unknown = null;

  for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
    const task = new UploadTask(new File(file.uri), url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName,
      mimeType: file.type,
      headers,
      parameters: fields,
    });

    let result: { body: string; status: number };
    try {
      result = await task.uploadAsync();
    } catch (e) {
      // No HTTP response at all: an unreadable file or a broken connection. Only this class of
      // failure is retried — a server that answered has already made its decision.
      lastTransportError = e;
      if (attempt < UPLOAD_ATTEMPTS - 1) await sleep(uploadRetryDelay(attempt));
      continue;
    } finally {
      // Freeing the native handle is housekeeping — it must never be the thing that fails the
      // upload the caller is waiting on.
      try {
        task.release();
      } catch {
        // Already released, or the task never reached native. Nothing to recover.
      }
    }

    const parsed = parseText(result.body);

    if (result.status === 401) {
      void useAuth.getState().signOut();
      throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 401, parsed);
    }

    if (result.status < 200 || result.status >= 300) {
      throw new ApiError(messageFrom(parsed, result.status), result.status, parsed);
    }

    const data =
      parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)
        ? (parsed as { data: T }).data
        : (parsed as T);

    return { data, status: result.status };
  }

  // Every attempt died before the server answered. The underlying reason is carried through
  // verbatim: swallowing it is what made this failure mode undiagnosable for weeks.
  const detail =
    lastTransportError instanceof Error && lastTransportError.message
      ? lastTransportError.message
      : String(lastTransportError ?? 'penyebab tidak diketahui');

  throw new ApiError(`Upload gagal setelah ${UPLOAD_ATTEMPTS} percobaan. ${detail}`, 0, {
    detail,
  });
}

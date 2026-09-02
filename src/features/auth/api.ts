import Constants from 'expo-constants';
import { isRole, type Role } from '@/domain/roles';
import { isDemoMode } from '@/features/demo/config';
import { findUserByCredentials, getUserByRole } from '@/features/demo/store';
import type { DemoUser } from '@/features/demo/seed';

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
  /** Present for STAFF — today's assigned cart. */
  cartCode?: string;
  cartId?: number;
  /** Present for BARISTA — the kitchen they belong to. */
  kitchenName?: string;
  kitchenId?: number;
  /** Whether a PIN sign-in credential exists. Never the PIN itself — see LoginPinController. */
  hasLoginPin?: boolean;
};

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/**
 * Maps the server's `user` object onto `AuthUser`. Shared by both sign-in routes so password and
 * PIN logins can never drift into producing differently-shaped sessions.
 */
function toSessionUser(user: Record<string, unknown>): AuthUser {
  if (!isRole(user['role'])) throw new AuthError('Respons server tidak valid.', 'server');

  return {
    id: String(user['id']),
    name: String(user['name']),
    role: user['role'],
    cartCode: user['cart_code'] ? String(user['cart_code']) : undefined,
    cartId: optionalNumber(user['cart_id']),
    kitchenName: user['kitchen_name'] ? String(user['kitchen_name']) : undefined,
    kitchenId: optionalNumber(user['kitchen_id']),
    hasLoginPin: user['has_login_pin'] === true,
  };
}

export type Session = {
  token: string;
  user: AuthUser;
};

export type Credentials = {
  phone: string;
  password: string;
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly kind: 'credentials' | 'network' | 'server' | 'config' = 'server',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function toAuthUser(user: DemoUser): AuthUser {
  return {
    id: String(user.id),
    name: user.name,
    role: user.role,
    cartCode: user.cartCode,
    cartId: user.cartId,
    kitchenName: user.kitchenName,
    kitchenId: user.kitchenId,
  };
}

function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined;
  if (!url) {
    throw new AuthError(
      'Konfigurasi apiBaseUrl belum diisi di app.json.',
      'config',
    );
  }
  return url;
}

/**
 * Real login against the Laravel API (Phase 0.6 in the task breakdown).
 *
 * The server — never the client — decides the role. The client only reports credentials.
 * A role sent from the client would be trivially forgeable, which is why the login screen has
 * no production role picker.
 */
export async function login(credentials: Credentials): Promise<Session> {
  if (isDemoMode()) {
    const user = findUserByCredentials(credentials.phone, credentials.password);
    if (!user) throw new AuthError('Nomor HP atau kata sandi salah.', 'credentials');
    return { token: `demo-token-${user.role.toLowerCase()}`, user: toAuthUser(user) };
  }

  const base = apiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        phone: credentials.phone,
        password: credentials.password,
        device_name: 'android',
      }),
    });
  } catch {
    throw new AuthError(
      'Tidak dapat menghubungi server. Periksa koneksi internet Anda.',
      'network',
    );
  }

  if (response.status === 401 || response.status === 422) {
    throw new AuthError('Nomor HP atau kata sandi salah.', 'credentials');
  }
  if (!response.ok) {
    throw new AuthError(`Server bermasalah (${response.status}). Coba lagi nanti.`, 'server');
  }

  const raw = (await response.json()) as { data?: { token?: string; user?: Record<string, unknown> } };
  // Every other endpoint goes through lib/api.ts's `request()`, which unwraps the `{ data: ... }`
  // envelope Laravel's JsonResource wraps every response in. This fetch bypasses that helper
  // (login has no token to attach yet), so it must unwrap the same envelope itself — reading
  // `body.token` directly here always failed against the real API with "Respons server tidak
  // valid.", because the token actually arrives as `body.data.token`.
  const body = raw.data;

  if (!body?.token || !body.user || !isRole(body.user['role'])) {
    throw new AuthError('Respons server tidak valid.', 'server');
  }

  return { token: body.token, user: toSessionUser(body.user) };
}

/**
 * Enter the app as any of the five roles without typing credentials — this is what lets the
 * `DemoBanner` role switcher work, and it is how one person walks the whole flow on one device.
 *
 * Gated on `extra.demoMode` (see `features/demo/config.ts`) so this works in a RELEASE demo APK,
 * not only in development — a demo build is a release build. `__DEV__` is kept as a second,
 * independent allowance below: outside demo mode, a development build may still use this to
 * review each role's UI against a real backend without a seeded account, exactly as before.
 * Outside BOTH of those, a release build throws rather than returning a session — that guard is
 * the point, and it is unchanged: a convenience that ships to production is a vulnerability.
 */
export async function loginAsDemoRole(role: Role): Promise<Session> {
  if (isDemoMode()) {
    const user = getUserByRole(role);
    return { token: `demo-token-${role.toLowerCase()}`, user: toAuthUser(user) };
  }

  if (!__DEV__) {
    throw new AuthError('Mode demo tidak tersedia pada build rilis.', 'config');
  }

  const demoUsers: Record<Role, AuthUser> = {
    ADMINISTRATOR: { id: 'demo-admin', name: 'Admin Demo', role: 'ADMINISTRATOR' },
    FINANCE: { id: 'demo-finance', name: 'Finance Demo', role: 'FINANCE' },
    BARISTA: {
      id: 'demo-barista',
      name: 'Barista Demo',
      role: 'BARISTA',
      kitchenName: 'Dapur Pusat Jakarta',
      kitchenId: 1,
    },
    RIDER: { id: 'demo-rider', name: 'Rider Demo', role: 'RIDER' },
    STAFF: { id: 'demo-staff', name: 'Maufu', role: 'STAFF', cartCode: '0018', cartId: 1 },
    CONTENT_CREATOR: { id: 'demo-creator', name: 'Creator Demo', role: 'CONTENT_CREATOR' },
  };

  return { token: `demo-token-${role.toLowerCase()}`, user: demoUsers[role] };
}

/**
 * Best-effort server-side revocation for a deliberate sign-out.
 *
 * Never throws. A user tapping Keluar must always end up signed out on the device, even with no
 * signal — the local session is cleared by the caller regardless of what happens here. This
 * exists so a token the server would otherwise honour indefinitely (Sanctum `expiration => null`)
 * does not outlive the session it belonged to.
 */
export async function revokeToken(token: string): Promise<void> {
  if (isDemoMode()) return;

  try {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    // Offline, or the token was already gone. Either way the device-side clear is what matters.
  }
}

/**
 * PIN sign-in — the optional alternative to typing a password in the field (docs/04 §Auth).
 *
 * Only reachable once the user has created a PIN under Settings, which itself re-checks their
 * password. The server answers one generic 401 whether the phone is unknown, the PIN is wrong, or
 * no PIN exists, and 429 once the per-account lockout trips; both are surfaced verbatim rather
 * than reworded, so a locked-out user is told to fall back to their password instead of being
 * left to guess.
 */
export async function loginWithPin(phone: string, pin: string): Promise<Session> {
  if (isDemoMode()) {
    const user = getUserByRole('STAFF');
    return { token: `demo-token-${user.role.toLowerCase()}`, user: toAuthUser(user) };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/auth/login-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone, pin, device_name: 'android' }),
    });
  } catch {
    throw new AuthError('Tidak dapat menghubungi server. Periksa koneksi internet Anda.', 'network');
  }

  if (response.status === 429) {
    throw new AuthError(
      'Terlalu banyak percobaan PIN. Tunggu beberapa menit atau masuk dengan kata sandi.',
      'credentials',
    );
  }
  if (response.status === 401 || response.status === 422) {
    throw new AuthError('Nomor HP atau PIN salah.', 'credentials');
  }
  if (!response.ok) {
    throw new AuthError(`Server bermasalah (${response.status}). Coba lagi nanti.`, 'server');
  }

  const raw = (await response.json()) as {
    data?: { token?: string; user?: Record<string, unknown> };
  };
  const body = raw.data;

  if (!body?.token || !body.user || !isRole(body.user['role'])) {
    throw new AuthError('Respons server tidak valid.', 'server');
  }

  return { token: body.token, user: toSessionUser(body.user) };
}

/**
 * Creates or replaces the caller's PIN. The account password is required even though a valid
 * token is already in hand — see LoginPinController for why a token alone must not be enough.
 *
 * Server-side validation messages (wrong password, PIN too predictable) are surfaced as written
 * rather than replaced with a generic failure: this is the one place where telling the user
 * exactly what is wrong is both safe and the whole point.
 */
export async function setLoginPin(token: string, pin: string, password: string): Promise<void> {
  if (isDemoMode()) return;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/me/login-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pin, password }),
    });
  } catch {
    throw new AuthError('Tidak dapat menghubungi server. Periksa koneksi internet Anda.', 'network');
  }

  if (response.ok) return;

  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      errors?: Record<string, string[]>;
    } | null;
    const first = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
    throw new AuthError(first ?? body?.message ?? 'PIN tidak dapat disimpan.', 'credentials');
  }

  throw new AuthError(`Server bermasalah (${response.status}). Coba lagi nanti.`, 'server');
}

/** Removes the caller's PIN, returning the account to password-only sign-in. */
export async function removeLoginPin(token: string): Promise<void> {
  if (isDemoMode()) return;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/me/login-pin`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AuthError('Tidak dapat menghubungi server. Periksa koneksi internet Anda.', 'network');
  }

  if (!response.ok) {
    throw new AuthError(`Server bermasalah (${response.status}). Coba lagi nanti.`, 'server');
  }
}

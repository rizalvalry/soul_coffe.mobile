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
};

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
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

  return {
    token: body.token,
    user: {
      id: String(body.user['id']),
      name: String(body.user['name']),
      role: body.user['role'],
      cartCode: body.user['cart_code'] ? String(body.user['cart_code']) : undefined,
      cartId: optionalNumber(body.user['cart_id']),
      kitchenName: body.user['kitchen_name'] ? String(body.user['kitchen_name']) : undefined,
      kitchenId: optionalNumber(body.user['kitchen_id']),
    },
  };
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
  };

  return { token: `demo-token-${role.toLowerCase()}`, user: demoUsers[role] };
}

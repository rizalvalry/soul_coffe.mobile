import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { isRole, type Role } from '@/domain/roles';
import { releaseRegistration, syncRegistration } from '@/features/push/registration';
import { resetSeenEvents } from '@/features/realtime/seen';
import { resetQueryClient } from '@/lib/queryClient';
import {
  AuthError,
  fetchCurrentUser,
  login,
  loginAsDemoRole,
  loginWithPin,
  revokeToken,
  type Credentials,
  type Session,
} from './api';

const SESSION_KEY = 'soul.session.v1';

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

/**
 * What a sign-in attempt actually decided.
 *
 * `ok` is not enough any more: the server can refuse a correct password because this account now
 * signs in with a PIN, and refuse a PIN because it no longer has one. Both are instructions to the
 * login screen, not errors to display, so they are returned rather than left in `error`.
 */
export type SignInOutcome =
  | { result: 'ok' }
  | { result: 'pin-required'; message: string }
  | { result: 'pin-not-set'; message: string }
  | { result: 'failed'; message: string };

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  submitting: boolean;
  cartRefreshStatus: 'idle' | 'loading' | 'error';
  cartRefreshError: string | null;

  /**
   * The phone of the last account to sign in on this device, and whether it had a PIN.
   *
   * Kept OUTSIDE the session so the login screen can offer PIN sign-in before anyone is
   * authenticated — that is the whole point of the shortcut. It is a convenience hint only: the
   * server re-decides everything, and a stale hint costs at most one wasted tap.
   */
  lastPhone: string | null;
  pinAvailable: boolean;

  restore: () => Promise<void>;
  signIn: (credentials: Credentials) => Promise<SignInOutcome>;
  signInWithPin: (phone: string, pin: string) => Promise<SignInOutcome>;
  signInAsDemo: (role: Role) => Promise<boolean>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Records that the signed-in user now does (or no longer does) have a PIN. */
  setPinAvailable: (available: boolean) => Promise<void>;
  /**
   * Ends the session locally after the SERVER has already revoked it — creating a PIN does that
   * as part of the same call. Skips the revoke request that `signOut` makes, which would only 401
   * against a token that is already gone.
   */
  endRevokedSession: () => Promise<void>;
  clearError: () => void;
};

const HINT_KEY = 'soul.signin.hint.v1';
const LOGOUT_PENDING_KEY = 'soul.logout.pending.v1';
let endingSession: Promise<void> | null = null;
let userRefreshId = 0;
let appliedUserRefreshId = 0;

async function persistLoggedOut(): Promise<void> {
  let markerWritten = false;
  try {
    await AsyncStorage.setItem(LOGOUT_PENDING_KEY, '1');
    markerWritten = true;
  } catch {
    // SecureStore deletion can still make the logout durable without the fallback marker.
  }
  try {
    await persist(null);
    if (markerWritten) {
      try { await AsyncStorage.removeItem(LOGOUT_PENDING_KEY); } catch { /* A stale marker only forces login. */ }
    }
  } catch {
    if (!markerWritten) throw new Error('Sesi lama belum dapat dihapus dari perangkat. Coba lagi.');
    // The marker prevents restore() from signing the old user back in after an app kill.
  }
}

async function clearLogoutMarker(): Promise<void> {
  try { await AsyncStorage.removeItem(LOGOUT_PENDING_KEY); } catch { /* Next launch safely requires login. */ }
}

function clearAccountState(): Promise<void> {
  // Clear active, inactive, and mutation caches before another identity can mount a screen.
  resetQueryClient();
  resetSeenEvents();
  // Delivered push content and an unconsumed tap are also previous-user data on a shared phone.
  try { Notifications.clearLastNotificationResponse(); } catch { /* Native notifications unavailable. */ }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    try {
      Notifications.dismissAllNotificationsAsync().then(
        () => { clearTimeout(timer); resolve(); },
        () => { clearTimeout(timer); resolve(); },
      );
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

type SignInHint = { phone: string; hasPin: boolean };

/** The hint is not a secret — it holds a phone number the user typed, never a credential. */
async function persistHint(hint: SignInHint | null) {
  try {
    if (hint) await AsyncStorage.setItem(HINT_KEY, JSON.stringify(hint));
    else await AsyncStorage.removeItem(HINT_KEY);
  } catch {
    // A missing hint only costs the PIN shortcut, never access.
  }
}

/** Tokens go to SecureStore (Keystore-backed), never AsyncStorage. */
async function persist(session: Session | null) {
  if (session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

function parseSession(raw: string): Session | null {
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed?.user || !isRole(parsed.user.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const useAuth = create<AuthState>((set) => ({
  status: 'restoring',
  session: null,
  error: null,
  submitting: false,
  cartRefreshStatus: 'idle',
  cartRefreshError: null,
  lastPhone: null,
  pinAvailable: false,

  refreshUser: async () => {
    const session = useAuth.getState().session;
    if (!session) return;
    const requestId = ++userRefreshId;
    set({ cartRefreshStatus: 'loading', cartRefreshError: null });
    try {
      const user = await fetchCurrentUser(session.token, session.user.role);
      const current = useAuth.getState().session;
      if (!current || current.token !== session.token || current.user.id !== user.id ||
        requestId < appliedUserRefreshId) return;
      appliedUserRefreshId = requestId;
      set({
        ...(JSON.stringify(current.user) === JSON.stringify(user)
          ? {} : { session: { ...current, user } }),
        cartRefreshStatus: 'idle',
        cartRefreshError: null,
      });
    } catch (error) {
      if (useAuth.getState().session?.token === session.token &&
        requestId === userRefreshId && requestId > appliedUserRefreshId) {
        set({
          cartRefreshStatus: 'error',
          cartRefreshError: error instanceof Error ? error.message : 'Gerobak belum bisa dicek. Coba lagi ya.',
        });
      }
      throw error;
    }
  },

  restore: async () => {
    // A previous logout interrupted during SecureStore deletion must never restore that token.
    try {
      if (await AsyncStorage.getItem(LOGOUT_PENDING_KEY)) {
        try {
          await persist(null);
          await clearLogoutMarker();
        } catch { /* Keep the marker for the next launch. */ }
        await persistHint(null);
        await clearAccountState();
        set({ session: null, status: 'unauthenticated', lastPhone: null, pinAvailable: false });
        return;
      }
    } catch {
      // If the marker cannot be read, do not trust an old token from this shared phone.
      set({ session: null, status: 'unauthenticated', lastPhone: null, pinAvailable: false });
      return;
    }
    // The sign-in hint lives in AsyncStorage, not SecureStore: it holds a phone number, never a
    // credential, and the login screen needs it even when there is no session to restore.
    try {
      const rawHint = await AsyncStorage.getItem(HINT_KEY);
      if (rawHint) {
        const hint = JSON.parse(rawHint) as SignInHint;
        if (hint?.phone) set({ lastPhone: hint.phone, pinAvailable: hint.hasPin === true });
      }
    } catch {
      // No hint just means no PIN shortcut on this launch.
    }

    // A stored session has no expiry — the server issues Sanctum tokens with
    // `'expiration' => null`, so the only thing that ends a session is an explicit sign-out.
    // Reaching the login screen because a disk read happened to fail would therefore be a bug,
    // not a policy, which is why a read error is retried instead of being treated as "no user".
    let raw: string | null = null;
    let read = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        raw = await SecureStore.getItemAsync(SESSION_KEY);
        read = true;
        break;
      } catch {
        // The Keystore can be briefly unavailable right after boot or an app update.
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }

    if (!read) {
      // Still unreadable. Send the user to login so the app is usable, but leave the stored blob
      // alone — the next launch will very likely read it and sign them straight back in.
      set({ session: null, status: 'unauthenticated', lastPhone: null, pinAvailable: false });
      return;
    }

    const session = raw ? parseSession(raw) : null;

    if (session) {
      await clearAccountState();
      set({ session, status: 'authenticated', cartRefreshStatus: 'idle', cartRefreshError: null });
      return;
    }

    // A corrupt or schema-drifted blob is discarded rather than half-trusted.
    if (raw) await persist(null);
    await persistHint(null);
    set({ session: null, status: 'unauthenticated', lastPhone: null, pinAvailable: false });
  },

  signIn: async (credentials) => {
    set({ submitting: true, error: null });
    try {
      if (endingSession) await endingSession;
      const session = await login(credentials);
      await persist(session);
      await clearLogoutMarker();
      const hasPin = session.user.hasLoginPin === true;
      await persistHint({ phone: credentials.phone, hasPin });
      await clearAccountState();
      set({
        session,
        status: 'authenticated',
        submitting: false,
        lastPhone: credentials.phone,
        pinAvailable: hasPin,
        cartRefreshStatus: 'idle',
        cartRefreshError: null,
      });

      // Fire and forget: a phone that cannot register for push must still be able to sign in.
      void syncRegistration(session.token);

      return { result: 'ok' };
    } catch (e) {
      if (e instanceof AuthError && e.kind === 'pin-required') {
        // The password was CORRECT — this account just uses its PIN now. Remember that, so the
        // screen opens on the PIN pad next time rather than sending them down this path again.
        await persistHint({ phone: credentials.phone, hasPin: true });
        set({
          submitting: false,
          error: null,
          lastPhone: credentials.phone,
          pinAvailable: true,
        });
        return { result: 'pin-required', message: e.message };
      }

      const message =
        e instanceof AuthError ? e.message : 'Terjadi kesalahan tidak terduga. Coba lagi.';
      set({ error: message, submitting: false });
      return { result: 'failed', message };
    }
  },

  signInWithPin: async (phone, pin) => {
    set({ submitting: true, error: null });
    try {
      if (endingSession) await endingSession;
      const session = await loginWithPin(phone, pin);
      await persist(session);
      await clearLogoutMarker();
      await persistHint({ phone, hasPin: true });
      await clearAccountState();
      set({
        session,
        status: 'authenticated',
        submitting: false,
        lastPhone: phone,
        pinAvailable: true,
        cartRefreshStatus: 'idle',
        cartRefreshError: null,
      });

      void syncRegistration(session.token);

      return { result: 'ok' };
    } catch (e) {
      if (e instanceof AuthError && e.kind === 'pin-not-set') {
        // An administrator has reset this account. Clear the stale hint so the device stops
        // offering a PIN that no longer exists.
        await persistHint({ phone, hasPin: false });
        set({ submitting: false, error: null, lastPhone: phone, pinAvailable: false });
        return { result: 'pin-not-set', message: e.message };
      }

      const message =
        e instanceof AuthError ? e.message : 'Terjadi kesalahan tidak terduga. Coba lagi.';
      set({ error: message, submitting: false });
      return { result: 'failed', message };
    }
  },

  setPinAvailable: async (available) => {
    const phone = useAuth.getState().lastPhone;
    if (phone) await persistHint({ phone, hasPin: available });

    const session = useAuth.getState().session;
    set({
      pinAvailable: available,
      ...(session
        ? { session: { ...session, user: { ...session.user, hasLoginPin: available } } }
        : {}),
    });
  },

  signInAsDemo: async (role) => {
    set({ submitting: true, error: null });
    try {
      if (endingSession) await endingSession;
      const session = await loginAsDemoRole(role);
      await persist(session);
      await clearLogoutMarker();
      await clearAccountState();
      set({ session, status: 'authenticated', submitting: false,
        cartRefreshStatus: 'idle', cartRefreshError: null });
      return true;
    } catch (e) {
      const message = e instanceof AuthError ? e.message : 'Mode demo gagal.';
      set({ error: message, submitting: false });
      return false;
    }
  },

  signOut: () => {
    if (endingSession) return endingSession;
    const token = useAuth.getState().session?.token;
    const clearedNotifications = clearAccountState();
    // Remove the authenticated tree now. It owns the socket, push listeners, and screen-local
    // state; leaving it mounted during network cleanup could repopulate the old query cache.
    set({ session: null, status: 'restoring', error: null, submitting: false,
      cartRefreshStatus: 'idle', cartRefreshError: null,
      lastPhone: null, pinAvailable: false });

    // Order matters: the push registration is deleted through an authenticated call, so it has to
    // happen before revoke. Doing it after the revoke would leave this device
    // subscribed to the departing user's events — and the next person to sign in on this phone
    // would receive them.
    const cleanup = (async () => {
      // Durable local logout first; a failed SecureStore deletion leaves a restore marker.
      let localError: Error | null = null;
      try { await persistLoggedOut(); } catch (e) { localError = e as Error; }
      await persistHint(null);
      await clearedNotifications;
      set({ status: 'unauthenticated', ...(localError ? { error: localError.message } : {}) });
      if (token) {
        await releaseRegistration(token);
        await revokeToken(token);
      }
      if (localError) throw localError;
    })();
    endingSession = cleanup.finally(() => { endingSession = null; });
    return endingSession;
  },

  endRevokedSession: () => {
    if (endingSession) return endingSession;
    // No revoke call and no device-release call: the server has already dropped every token for
    // this account, so both would 401. The push registration is deliberately LEFT in place — the
    // same person is about to sign back in on this same phone with their new PIN.
    const clearedNotifications = clearAccountState();
    set({ session: null, status: 'restoring', error: null,
      cartRefreshStatus: 'idle', cartRefreshError: null,
      lastPhone: null, pinAvailable: false });
    const cleanup = (async () => {
      let localError: Error | null = null;
      try { await persistLoggedOut(); } catch (e) { localError = e as Error; }
      await persistHint(null);
      await clearedNotifications;
      set({ status: 'unauthenticated', ...(localError ? { error: localError.message } : {}) });
    })();
    endingSession = cleanup.finally(() => { endingSession = null; });
    return endingSession;
  },

  clearError: () => set({ error: null }),
}));

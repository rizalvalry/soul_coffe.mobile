import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { isRole, type Role } from '@/domain/roles';
import {
  AuthError,
  login,
  loginAsDemoRole,
  loginWithPin,
  revokeToken,
  type Credentials,
  type Session,
} from './api';

const SESSION_KEY = 'soul.session.v1';

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  submitting: boolean;

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
  signIn: (credentials: Credentials) => Promise<boolean>;
  signInWithPin: (phone: string, pin: string) => Promise<boolean>;
  signInAsDemo: (role: Role) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Records that the signed-in user now does (or no longer does) have a PIN. */
  setPinAvailable: (available: boolean) => Promise<void>;
  clearError: () => void;
};

const HINT_KEY = 'soul.signin.hint.v1';

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
  lastPhone: null,
  pinAvailable: false,

  restore: async () => {
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
      set({ session: null, status: 'unauthenticated' });
      return;
    }

    const session = raw ? parseSession(raw) : null;

    if (session) {
      set({ session, status: 'authenticated' });
      return;
    }

    // A corrupt or schema-drifted blob is discarded rather than half-trusted.
    if (raw) await persist(null);
    set({ session: null, status: 'unauthenticated' });
  },

  signIn: async (credentials) => {
    set({ submitting: true, error: null });
    try {
      const session = await login(credentials);
      await persist(session);
      const hasPin = session.user.hasLoginPin === true;
      await persistHint({ phone: credentials.phone, hasPin });
      set({
        session,
        status: 'authenticated',
        submitting: false,
        lastPhone: credentials.phone,
        pinAvailable: hasPin,
      });
      return true;
    } catch (e) {
      const message =
        e instanceof AuthError ? e.message : 'Terjadi kesalahan tidak terduga. Coba lagi.';
      set({ error: message, submitting: false });
      return false;
    }
  },

  signInWithPin: async (phone, pin) => {
    set({ submitting: true, error: null });
    try {
      const session = await loginWithPin(phone, pin);
      await persist(session);
      await persistHint({ phone, hasPin: true });
      set({
        session,
        status: 'authenticated',
        submitting: false,
        lastPhone: phone,
        pinAvailable: true,
      });
      return true;
    } catch (e) {
      const message =
        e instanceof AuthError ? e.message : 'Terjadi kesalahan tidak terduga. Coba lagi.';
      set({ error: message, submitting: false });
      return false;
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
      const session = await loginAsDemoRole(role);
      await persist(session);
      set({ session, status: 'authenticated', submitting: false });
      return true;
    } catch (e) {
      const message = e instanceof AuthError ? e.message : 'Mode demo gagal.';
      set({ error: message, submitting: false });
      return false;
    }
  },

  signOut: async () => {
    // Revoke server-side first, best-effort. Tokens never expire on their own, so a session
    // dropped only on the device would leave a valid credential alive on the server forever.
    // Failure here must not trap the user in a signed-in state, so the local clear happens
    // either way.
    const token = useAuth.getState().session?.token;
    if (token) await revokeToken(token);

    await persist(null);
    set({ session: null, status: 'unauthenticated', error: null });
  },

  clearError: () => set({ error: null }),
}));

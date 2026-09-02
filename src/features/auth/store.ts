import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { isRole, type Role } from '@/domain/roles';
import { AuthError, login, loginAsDemoRole, type Credentials, type Session } from './api';

const SESSION_KEY = 'soul.session.v1';

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  submitting: boolean;

  restore: () => Promise<void>;
  signIn: (credentials: Credentials) => Promise<boolean>;
  signInAsDemo: (role: Role) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

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

  restore: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      const session = raw ? parseSession(raw) : null;

      if (session) {
        set({ session, status: 'authenticated' });
      } else {
        // A corrupt or schema-drifted blob is discarded rather than half-trusted.
        if (raw) await persist(null);
        set({ session: null, status: 'unauthenticated' });
      }
    } catch {
      set({ session: null, status: 'unauthenticated' });
    }
  },

  signIn: async (credentials) => {
    set({ submitting: true, error: null });
    try {
      const session = await login(credentials);
      await persist(session);
      set({ session, status: 'authenticated', submitting: false });
      return true;
    } catch (e) {
      const message =
        e instanceof AuthError ? e.message : 'Terjadi kesalahan tidak terduga. Coba lagi.';
      set({ error: message, submitting: false });
      return false;
    }
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
    await persist(null);
    set({ session: null, status: 'unauthenticated', error: null });
  },

  clearError: () => set({ error: null }),
}));

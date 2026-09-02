import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Versioned on purpose: bumping the suffix is how a future release re-introduces the tour after
 * a change big enough to warrant it, without needing a migration.
 */
const SEEN_KEY = 'soul.onboarding.v1';

export type OnboardingStatus = 'loading' | 'pending' | 'done';

type OnboardingState = {
  status: OnboardingStatus;
  load: () => Promise<void>;
  complete: () => Promise<void>;
};

export const useOnboarding = create<OnboardingState>((set) => ({
  status: 'loading',

  load: async () => {
    try {
      const seen = await AsyncStorage.getItem(SEEN_KEY);
      set({ status: seen ? 'done' : 'pending' });
    } catch {
      // Storage is unreadable. Skipping the tour is the safe failure: showing it again is a
      // minor annoyance, but blocking entry to the app over an intro screen is not acceptable.
      set({ status: 'done' });
    }
  },

  complete: async () => {
    // The flag is written before the state flips so a crash mid-transition cannot leave the tour
    // showing forever; a failed write only costs one repeat.
    try {
      await AsyncStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      // Non-fatal — see above.
    }
    set({ status: 'done' });
  },
}));

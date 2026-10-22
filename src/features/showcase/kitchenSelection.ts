import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { getQueryClient } from '@/lib/queryClient';

const KEY = 'soul.selectedKitchen.v1';
let selectionWrite: Promise<void> = Promise.resolve();

type KitchenSelection = {
  kitchenId: number | null;
  loaded: boolean;
  revision: number;
  load: () => Promise<void>;
  select: (id: number | null) => Promise<void>;
};

export const useKitchenSelection = create<KitchenSelection>((set, get) => ({
  kitchenId: null,
  loaded: false,
  revision: 0,
  load: async () => {
    if (get().loaded) return;
    const revision = get().revision;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const id = raw === null ? null : Number(raw);
      if (get().revision === revision) {
        set({ kitchenId: id !== null && Number.isInteger(id) && id > 0 ? id : null, loaded: true });
      }
    } catch {
      if (get().revision === revision) set({ kitchenId: null, loaded: true });
    }
  },
  select: async (id) => {
    if (id !== null && (!Number.isInteger(id) || id <= 0)) return;
    const revision = get().revision + 1;
    set({ revision });
    selectionWrite = selectionWrite.catch(() => {}).then(() => id === null
      ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, String(id)));
    await selectionWrite;
    if (get().revision === revision) set({ kitchenId: id, loaded: true });
    void getQueryClient().invalidateQueries();
  },
}));

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStorage } from '@/store/storage';

/**
 * Non-secret multiplayer state, persisted on the device. The bearer token is NOT here: it lives in the
 * platform secure store (see `token.ts`).
 */
interface MultiplayerState {
  /** Base URL of the game server, e.g. `http://localhost:3000` for development (adb reverse). */
  serverUrl: string;
  playerId: string | null;
  /** The user has read the explanation and joined. Nothing is sent to the server before this. */
  joined: boolean;
  setServerUrl: (url: string) => void;
  setJoined: (playerId: string) => void;
  leave: () => void;
}

export const DEFAULT_SERVER_URL = 'http://localhost:3000';

export const useMultiplayerStore = create<MultiplayerState>()(
  persist(
    (set) => ({
      serverUrl: DEFAULT_SERVER_URL,
      playerId: null,
      joined: false,
      setServerUrl: (serverUrl) => set({ serverUrl: serverUrl.trim().replace(/\/+$/, '') }),
      setJoined: (playerId) => set({ playerId, joined: true }),
      leave: () => set({ playerId: null, joined: false }),
    }),
    { name: 'focus-mode-multiplayer', version: 1, storage: createJSONStorage(() => mmkvStorage) },
  ),
);

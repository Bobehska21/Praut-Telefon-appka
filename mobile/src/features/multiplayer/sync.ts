import { useEffect } from 'react';
import { AppState } from 'react-native';

import { FocusModule } from '@/modules/focus';
import { safeNickname } from '@/features/nickname';
import { useAppStore } from '@/store';
import { fetchMe, publishToken, syncProfile } from './service';
import { useMultiplayerStore } from './store';
import { loadToken } from './token';

/**
 * Keeps the phone and the game server in step while the app is open: gives the native layer the server
 * address and token, refreshes the wasteman state from the server (which is authoritative), registers
 * today's Bluetooth token and pushes the public profile when it changes. Every call is best effort: with
 * no connection it simply tries again next time. Mount once, at the root.
 */
export function useMultiplayerSync(): void {
  const joined = useMultiplayerStore((s) => s.joined);
  const serverUrl = useMultiplayerStore((s) => s.serverUrl);
  const nickname = useAppStore((s) => safeNickname(s.settings.nickname));
  const enabled = useAppStore((s) => s.settings.nearbyEnabled !== false);

  // Hand the address and token to the background service.
  useEffect(() => {
    if (!joined) return;
    void loadToken().then((token) => {
      if (token) void FocusModule.setServer(serverUrl, token);
    });
  }, [joined, serverUrl]);

  // Profile changes (nickname, switch).
  useEffect(() => {
    if (!joined) return;
    void syncProfile().catch(() => undefined);
  }, [joined, nickname, enabled]);

  // Today's token, the server's view of my state, and again whenever the app comes back to the foreground.
  useEffect(() => {
    if (!joined) return;
    const refresh = () => {
      void publishToken().catch(() => undefined);
      void fetchMe().catch(() => undefined);
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [joined]);
}

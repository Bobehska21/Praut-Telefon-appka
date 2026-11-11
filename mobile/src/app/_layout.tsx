import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import i18n, { resolveLanguage } from '@/i18n';
import { useMultiplayerSync } from '@/features/multiplayer/sync';
import { useNearbySync } from '@/features/nearby';
import { evaluateProgress } from '@/features/progress/engine';
import { syncSchedules, syncWithNative } from '@/features/session';
import { RewardModal } from '@/components/reward-modal';
import { FocusModule } from '@/modules/focus';
import { useAppStore } from '@/store';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const theme = useTheme();
  useNearbySync();
  useMultiplayerSync();
  const language = useAppStore((s) => s.settings.language);
  const schedules = useAppStore((s) => s.schedules);
  const unlockGuard = useAppStore((s) => s.settings.unlockGuard);

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(language));
  }, [language]);

  useEffect(() => {
    evaluateProgress(); // achievements and level-ups that became true while the app was closed
    void syncWithNative();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncWithNative();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void FocusModule.setUnlockGuard(unlockGuard);
  }, [unlockGuard]);

  useEffect(() => {
    void syncSchedules();
  }, [schedules]);

  return (
    <>
      <StatusBar style="light" />
      <RewardModal />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.accent,
          headerTitleStyle: { color: theme.text },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="unlock" options={{ presentation: 'modal' }} />
        <Stack.Screen name="blocked" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile/[id]" options={{ headerShown: true, title: '' }} />
      </Stack>
    </>
  );
}

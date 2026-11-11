import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import i18n, { resolveLanguage } from '@/i18n';
import { syncSchedules, syncWithNative } from '@/features/session';
import { FocusModule } from '@/modules/focus';
import { useAppStore } from '@/store';

export default function RootLayout() {
  const language = useAppStore((s) => s.settings.language);
  const schedules = useAppStore((s) => s.schedules);
  const unlockGuard = useAppStore((s) => s.settings.unlockGuard);

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(language));
  }, [language]);

  useEffect(() => {
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
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="unlock" options={{ presentation: 'modal' }} />
        <Stack.Screen name="blocked" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile/[id]" options={{ headerShown: true, title: '' }} />
      </Stack>
    </>
  );
}

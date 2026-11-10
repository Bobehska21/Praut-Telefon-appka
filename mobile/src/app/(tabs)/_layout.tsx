import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAppStore } from '@/store';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const onboardingDone = useAppStore((s) => s.settings.onboardingDone);

  if (!onboardingDone) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 12 },
      }}>
      <Tabs.Screen name="index" options={{ title: t('home.title') }} />
      <Tabs.Screen name="profiles" options={{ title: t('profiles.title') }} />
      <Tabs.Screen name="schedule" options={{ title: t('schedule.title') }} />
      <Tabs.Screen name="stats" options={{ title: t('stats.title') }} />
      <Tabs.Screen name="settings" options={{ title: t('settings.title') }} />
    </Tabs>
  );
}

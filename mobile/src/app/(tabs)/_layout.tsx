import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppStore } from '@/store';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Outline when idle, solid when selected. */
const ICONS: Record<string, { idle: IconName; active: IconName }> = {
  index: { idle: 'flame-outline', active: 'flame' },
  profiles: { idle: 'layers-outline', active: 'layers' },
  schedule: { idle: 'calendar-outline', active: 'calendar' },
  stats: { idle: 'stats-chart-outline', active: 'stats-chart' },
  settings: { idle: 'settings-outline', active: 'settings' },
};

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const onboardingDone = useAppStore((s) => s.settings.onboardingDone);

  if (!onboardingDone) return <Redirect href="/onboarding" />;

  const screen = (name: keyof typeof ICONS, title: string) => (
    <Tabs.Screen
      name={name}
      options={{
        title,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? ICONS[name].active : ICONS[name].idle} size={size} color={color as string} />
        ),
      }}
    />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.background },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      {screen('index', t('home.title'))}
      {screen('profiles', t('profiles.title'))}
      {screen('schedule', t('schedule.title'))}
      {screen('stats', t('stats.title'))}
      {screen('settings', t('settings.title'))}
    </Tabs>
  );
}

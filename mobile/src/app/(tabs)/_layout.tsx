import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { adminWhoami } from '@/features/admin';

import { useMultiplayerStore } from '@/features/multiplayer/store';
import { FocusModule } from '@/modules/focus';
import { useAppStore } from '@/store';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Outline when idle, solid when selected. */
const ICONS: Record<string, { idle: IconName; active: IconName }> = {
  index: { idle: 'flame-outline', active: 'flame' },
  profiles: { idle: 'layers-outline', active: 'layers' },
  progress: { idle: 'trophy-outline', active: 'trophy' },
  players: { idle: 'people-outline', active: 'people' },
  schedule: { idle: 'calendar-outline', active: 'calendar' },
  stats: { idle: 'stats-chart-outline', active: 'stats-chart' },
  settings: { idle: 'settings-outline', active: 'settings' },
  admin: { idle: 'shield-checkmark-outline', active: 'shield-checkmark' },
};

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const onboardingDone = useAppStore((s) => s.settings.onboardingDone);

  const signedIn = useMultiplayerStore((s) => s.joined);
  // The server decides who is an admin; this only decides whether to show the tab.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    adminWhoami().then(() => alive && setIsAdmin(true), () => alive && setIsAdmin(false));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  if (!onboardingDone) return <Redirect href="/onboarding" />;
  // An account (username + password) is required after the first steps. Multiplayer is Android-only for now,
  // so iOS has nothing to sign in to.
  if (FocusModule.platform === 'android' && !signedIn) return <Redirect href="/auth" />;

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
      {screen('progress', t('progress.title'))}
      {screen('players', t('players.title'))}
      {screen('profiles', t('profiles.title'))}
      {/* Reachable from Progress and Profiles, but not tabs of their own: seven tabs would not fit. */}
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="stats" options={{ href: null }} />
      {screen('settings', t('settings.title'))}
      {isAdmin ? screen('admin', t('settings.adminTab')) : <Tabs.Screen name="admin" options={{ href: null }} />}
    </Tabs>
  );
}

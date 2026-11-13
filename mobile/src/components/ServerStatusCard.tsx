import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { ApiError } from '@/features/multiplayer/api';
import { fetchMe, fetchStats } from '@/features/multiplayer/service';
import { useMultiplayerStore } from '@/features/multiplayer/store';
import { spacing, useTheme } from '@/theme';

const REFRESH_MS = 30_000;
const MAX_SHIELDS = 3;

/**
 * What the server has credited today (minutes and shields), refreshed every 30 s while the screen is shown.
 * Minutes and shields exist only on the server, so when it cannot be reached this says so instead of showing
 * nothing: the phone's own timer keeps running but nothing is being credited.
 */
export function ServerStatusCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const joined = useMultiplayerStore((s) => s.joined);
  const [data, setData] = useState<{ minutes: number; shields: number } | null>(null);
  const [offline, setOffline] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!joined) return;
      let alive = true;
      const load = async () => {
        try {
          const [stats, me] = await Promise.all([fetchStats(), fetchMe()]);
          if (!alive) return;
          setData({ minutes: stats.focusMinutesToday, shields: me.shields });
          setOffline(false);
        } catch (e) {
          if (alive && e instanceof ApiError && e.code === 'network') setOffline(true);
        }
      };
      void load();
      const timer = setInterval(() => void load(), REFRESH_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [joined]),
  );

  if (!joined) return null;
  return (
    <Card>
      <View style={styles.row}>
        <AppText weight="600">{t('home.serverMinutes', { count: data?.minutes ?? 0 })}</AppText>
        <View style={styles.shields} accessibilityLabel={t('players.shields', { count: data?.shields ?? 0 })}>
          {Array.from({ length: MAX_SHIELDS }, (_, i) => (
            <Ionicons
              key={i}
              name={i < (data?.shields ?? 0) ? 'shield' : 'shield-outline'}
              size={20}
              color={i < (data?.shields ?? 0) ? theme.accent : theme.textMuted}
            />
          ))}
        </View>
      </View>
      {offline && (
        <AppText size={13} style={{ color: theme.danger }}>
          {t('home.serverOffline')}
        </AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  shields: { flexDirection: 'row', gap: spacing.xs },
});

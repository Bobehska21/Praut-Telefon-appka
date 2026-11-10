import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { buildDayStats, formatDuration, totalBlocked, totalFocusMs } from '@/features/stats';
import { useAppStore } from '@/store';
import { spacing, useTheme } from '@/theme';

export default function StatsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const sessions = useAppStore((s) => s.sessions);
  const attempts = useAppStore((s) => s.attempts);
  const active = useAppStore((s) => s.session);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const days = useMemo(() => {
    // Include the running session so today's number is live.
    const all = active
      ? [...sessions, { id: 'live', profileId: active.profileId, startedAt: active.startedAt, endedAt: now }]
      : sessions;
    return buildDayStats(all, attempts, 7, now);
  }, [sessions, attempts, active, now]);

  const today = days[days.length - 1];
  const max = Math.max(1, ...days.map((d) => d.focusMs));

  return (
    <Screen>
      <AppText size={24} weight="700">
        {t('stats.title')}
      </AppText>
      <Card>
        <AppText muted size={14}>
          {t('stats.today')}
        </AppText>
        <AppText size={28} weight="700">
          {formatDuration(today.focusMs)}
        </AppText>
        <AppText muted size={14}>
          {t('stats.blocked')}: {today.blocked}
        </AppText>
      </Card>
      <Card>
        <AppText muted size={14}>
          {t('stats.week')}
        </AppText>
        <AppText size={22} weight="600">
          {formatDuration(totalFocusMs(days))}
        </AppText>
        <AppText muted size={14}>
          {t('stats.blocked')}: {totalBlocked(days)}
        </AppText>
        <View style={styles.bars}>
          {days.map((d) => (
            <View key={d.date} style={styles.barCol} accessibilityLabel={`${d.date}: ${formatDuration(d.focusMs)}`}>
              <View
                style={[
                  styles.bar,
                  { height: Math.max(4, (d.focusMs / max) * 80), backgroundColor: theme.primary },
                ]}
              />
              <AppText muted size={11}>
                {d.date.slice(8)}
              </AppText>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110, marginTop: spacing.sm },
  barCol: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  bar: { width: 16, borderRadius: 4 },
});

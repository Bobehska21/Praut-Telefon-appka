import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Heading, Screen } from '@/components/ui';
import {
  buildDayStats,
  computeStreaks,
  formatDuration,
  totalBlocked,
  totalFocusMs,
  weekdayOf,
} from '@/features/stats';
import { useAppStore } from '@/store';
import { spacing, useTheme } from '@/theme';

const BAR_AREA = 96;

export default function StatsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const sessions = useAppStore((s) => s.sessions);
  const attempts = useAppStore((s) => s.attempts);
  const active = useAppStore((s) => s.session);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // The running session is included so today's number and the streak are live.
  const all = useMemo(
    () =>
      active
        ? [...sessions, { id: 'live', profileId: active.profileId, startedAt: active.startedAt, endedAt: now }]
        : sessions,
    [sessions, active, now],
  );
  const days = useMemo(() => buildDayStats(all, attempts, 7, now), [all, attempts, now]);
  const streaks = useMemo(() => computeStreaks(all, now), [all, now]);

  const today = days[days.length - 1];
  const max = Math.max(1, ...days.map((d) => d.focusMs));

  return (
    <Screen>
      <Button label={`‹ ${t('progress.title')}`} variant="secondary" onPress={() => router.navigate('/progress')} />
      <Heading>{t('stats.title')}</Heading>

      <Card style={styles.streakCard}>
        <View style={[styles.flame, { borderColor: streaks.current > 0 ? theme.primary : theme.border }]}>
          <Ionicons
            name={streaks.current > 0 ? 'flame' : 'flame-outline'}
            size={34}
            color={streaks.current > 0 ? theme.accent : theme.textMuted}
          />
        </View>
        <View style={styles.flex}>
          <AppText size={22} weight="700" accent={streaks.current > 0} muted={streaks.current === 0}>
            {streaks.current > 0 ? t('stats.streakDays', { count: streaks.current }) : t('stats.streakEmpty')}
          </AppText>
          {streaks.best > 0 && (
            <AppText muted size={13}>
              {t('stats.best', { count: streaks.best })}
            </AppText>
          )}
        </View>
      </Card>

      <Card>
        <AppText muted size={14}>
          {t('stats.today')}
        </AppText>
        <AppText size={30} weight="700">
          {formatDuration(today.focusMs)}
        </AppText>
        <AppText muted size={14}>
          {t('stats.blocked')}: {today.blocked}
        </AppText>
      </Card>

      <Card>
        <View style={styles.between}>
          <AppText muted size={14}>
            {t('stats.week')}
          </AppText>
          <AppText weight="600" accent>
            {formatDuration(totalFocusMs(days))}
          </AppText>
        </View>
        <AppText muted size={13}>
          {t('stats.blocked')}: {totalBlocked(days)}
        </AppText>

        <View style={styles.bars}>
          {days.map((d, index) => {
            const isToday = index === days.length - 1;
            const height = d.focusMs > 0 ? Math.max(6, (d.focusMs / max) * BAR_AREA) : 3;
            return (
              <View key={d.date} style={styles.barCol} accessibilityLabel={`${d.date}: ${formatDuration(d.focusMs)}`}>
                <View style={styles.barSlot}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height,
                        backgroundColor: d.focusMs > 0 ? (isToday ? theme.accent : theme.primary) : theme.border,
                        opacity: d.focusMs > 0 && !isToday ? 0.75 : 1,
                      },
                    ]}
                  />
                </View>
                <AppText size={11} weight={isToday ? '700' : '400'} accent={isToday} muted={!isToday}>
                  {t(`days.${weekdayOf(d.date)}`)}
                </AppText>
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flame: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  barCol: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  barSlot: { height: BAR_AREA, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 5 },
});

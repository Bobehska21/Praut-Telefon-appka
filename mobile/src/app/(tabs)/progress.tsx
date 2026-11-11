import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Heading, ProgressBar, Screen } from '@/components/ui';
import { safeNickname } from '@/features/nickname';
import { claim, snapshot, type QuestView } from '@/features/progress/engine';
import { withLiveSession } from '@/features/progress/live';
import { FocusModule, type NearbyEncounter } from '@/modules/focus';
import { useAppStore } from '@/store';
import { radius, spacing, useTheme } from '@/theme';

export default function ProgressScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const sessions = useAppStore((s) => s.sessions);
  const claimed = useAppStore((s) => s.claimed);
  const achievements = useAppStore((s) => s.achievements);
  const active = useAppStore((s) => s.session);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // A running session counts too, so quests fill up live.
  const all = useMemo(() => withLiveSession(sessions, active, now), [sessions, active, now]);
  // People the user accepted when they were nearby (kept on the device by the native layer).
  const [encounters, setEncounters] = useState<NearbyEncounter[]>([]);
  useEffect(() => {
    const load = () => void FocusModule.getNearbyEncounters().then(setEncounters);
    load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, []);

  const snap = useMemo(() => snapshot({ sessions: all, claimed, achievements }, now), [all, claimed, achievements, now]);

  const onClaim = (view: QuestView) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    claim(view);
  };

  return (
    <Screen>
      <Heading>{t('progress.title')}</Heading>

      <Card>
        <View style={styles.levelRow}>
          <View style={[styles.levelBadge, { borderColor: theme.primary }]}>
            <AppText size={26} weight="700" accent>
              {snap.level.level}
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText size={20} weight="700">
              {t(`progress.rank.${snap.rank}`)}
            </AppText>
            <AppText muted size={13}>
              {t('progress.level', { level: snap.level.level })} · {t('progress.total', { xp: snap.xp })}
            </AppText>
          </View>
        </View>
        <ProgressBar fraction={snap.level.fraction} height={10} />
        <AppText muted size={13}>
          {t('progress.xp', { into: snap.level.into, needed: snap.level.needed })}
        </AppText>
      </Card>

      <Section title={t('progress.todayQuests')} />
      {snap.daily.map((view) => (
        <QuestCard key={view.quest.id} view={view} onClaim={onClaim} />
      ))}

      <Section title={t('progress.weeklyQuests')} />
      {snap.weekly.map((view) => (
        <QuestCard key={view.quest.id} view={view} onClaim={onClaim} />
      ))}

      {FocusModule.platform === 'android' && (
        <>
          <Section title={t('progress.nearbyTitle')} />
          {encounters.length === 0 ? (
            <AppText muted size={13}>
              {t('progress.nearbyEmpty')}
            </AppText>
          ) : (
            encounters.slice(0, 10).map((e) => (
              <Card key={`${e.at}-${e.nickname}`}>
                <View style={styles.questTop}>
                  <Ionicons name="people" size={20} color={theme.accent} />
                  <AppText weight="600" style={styles.flex}>
                    {t('progress.nearbyLine', {
                      // Anything received from another phone is checked again here, whatever that phone sent.
                      name: safeNickname(e.nickname) || t('progress.anonymous'),
                      rank: t(`progress.rank.${e.rank}`),
                      level: e.level,
                      streak: e.streak,
                    })}
                  </AppText>
                </View>
                <AppText muted size={12}>
                  {new Date(e.at).toLocaleString()}
                </AppText>
              </Card>
            ))
          )}
        </>
      )}

      <Section title={t('progress.achievements')} />
      <View style={styles.grid}>
        {snap.achievements.map(({ def, unlockedAt }) => {
          const unlocked = unlockedAt !== null;
          return (
            <View
              key={def.id}
              style={[styles.tile, { borderColor: unlocked ? theme.primary : theme.border, backgroundColor: theme.surface }]}
              accessibilityLabel={`${t(`progress.ach.${def.id}.title`)}: ${t(`progress.ach.${def.id}.desc`)}`}>
              <View style={[styles.tileIcon, { borderColor: unlocked ? theme.primary : theme.border }]}>
                <Ionicons
                  name={unlocked ? (def.icon as never) : 'lock-closed-outline'}
                  size={24}
                  color={unlocked ? theme.accent : theme.textMuted}
                />
              </View>
              <AppText size={12} weight="700" style={styles.center} muted={!unlocked}>
                {t(`progress.ach.${def.id}.title`)}
              </AppText>
              <AppText size={11} muted style={styles.center}>
                {t(`progress.ach.${def.id}.desc`)}
              </AppText>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

function Section({ title }: { title: string }) {
  return (
    <AppText size={13} weight="700" muted style={styles.section}>
      {title.toLocaleUpperCase()}
    </AppText>
  );
}

function questTitle(t: TFunction, view: QuestView): string {
  return t(`progress.quests.${view.quest.key}`, { target: view.quest.target });
}

function QuestCard({ view, onClaim }: { view: QuestView; onClaim: (view: QuestView) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ready = view.done && !view.claimed;
  return (
    <Card style={view.claimed ? styles.dim : undefined}>
      <View style={styles.questTop}>
        <AppText weight="600" style={styles.flex}>
          {questTitle(t, view)}
        </AppText>
        <AppText weight="700" accent size={14}>
          {t('progress.reward.xp', { xp: view.quest.xp })}
        </AppText>
      </View>
      <ProgressBar fraction={view.goal > 0 ? view.value / view.goal : 0} />
      <View style={styles.questBottom}>
        <AppText muted size={13}>
          {view.quest.kind === 'earlySession' ? (view.done ? '1 / 1' : '0 / 1') : `${view.value} / ${view.goal}`}
        </AppText>
        {ready ? (
          <Button label={t('progress.claim')} onPress={() => onClaim(view)} />
        ) : view.claimed ? (
          <View style={styles.claimed}>
            <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
            <AppText accent size={13} weight="600">
              {t('progress.claimed')}
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  section: { letterSpacing: 2, marginTop: spacing.sm },
  dim: { opacity: 0.6 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  claimed: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31.5%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

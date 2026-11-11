import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { TFunction } from 'i18next';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { ACHIEVEMENTS } from '@/features/progress/achievements';
import { rankKey } from '@/features/progress/xp';
import { useAppStore } from '@/store';
import type { RewardEvent } from '@/store/types';
import { radius, spacing, useTheme } from '@/theme';

/** Celebrates one reward at a time (session finished, quest claimed, achievement, level up). */
export function RewardModal() {
  const { t } = useTranslation();
  const theme = useTheme();
  const event = useAppStore((s) => s.rewardQueue[0]);
  const pop = useAppStore((s) => s.popReward);

  const id = event?.id;
  useEffect(() => {
    if (id) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [id]);

  if (!event) return null;
  const { icon, heading, title } = describe(event, t);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={pop}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
          <View style={[styles.icon, { borderColor: theme.primary }]}>
            <Ionicons name={icon as never} size={44} color={theme.accent} />
          </View>
          <AppText size={12} weight="700" muted style={styles.heading}>
            {heading.toLocaleUpperCase()}
          </AppText>
          <AppText size={22} weight="700" style={styles.center}>
            {title}
          </AppText>
          {event.xp > 0 && (
            <AppText size={28} weight="700" accent>
              {t('progress.reward.xp', { xp: event.xp })}
            </AppText>
          )}
          {(event.points ?? 0) > 0 && (
            <AppText size={28} weight="700" accent>
              {t('progress.reward.points', { points: event.points })}
            </AppText>
          )}
          <Button label={t('progress.reward.continue')} onPress={pop} />
        </View>
      </View>
    </Modal>
  );
}

function describe(event: RewardEvent, t: TFunction) {
  switch (event.kind) {
    case 'session':
      return {
        icon: 'flame',
        heading: t(`progress.reward.${event.ref === 'completed' ? 'completed' : 'stopped'}`),
        title: t('progress.reward.minutes', { minutes: event.params?.minutes ?? 0 }),
      };
    case 'quest':
      return {
        icon: 'checkmark-circle',
        heading: t('progress.reward.quest'),
        title: t(`progress.quests.${event.ref}`, { ...event.params }),
      };
    case 'achievement':
      return {
        icon: ACHIEVEMENTS.find((a) => a.id === event.ref)?.icon ?? 'trophy',
        heading: t('progress.reward.achievement'),
        title: t(`progress.ach.${event.ref}.title`),
      };
    case 'level':
      return {
        icon: 'arrow-up-circle',
        heading: t('progress.reward.level'),
        title: `${t('progress.level', { level: event.level })} · ${t(`progress.rank.${rankKey(event.level ?? 1)}`)}`,
      };
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { letterSpacing: 2 },
  center: { textAlign: 'center' },
});

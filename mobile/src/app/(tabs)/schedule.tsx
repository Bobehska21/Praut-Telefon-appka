import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { AppText, Button, Card, Chip, Screen } from '@/components/ui';
import { formatMinute } from '@/features/scheduler';
import { useAppStore, type Schedule } from '@/store';
import { spacing } from '@/theme';

const STEP = 30;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function shift(minute: number, delta: number): number {
  return (minute + delta + 24 * 60) % (24 * 60);
}

export default function ScheduleScreen() {
  const { t } = useTranslation();
  const schedules = useAppStore((s) => s.schedules);
  const profiles = useAppStore((s) => s.profiles);
  const selectedId = useAppStore((s) => s.selectedProfileId);
  const add = useAppStore((s) => s.addSchedule);

  return (
    <Screen>
      <AppText size={24} weight="700">
        {t('schedule.title')}
      </AppText>
      {schedules.length === 0 && <AppText muted>{t('schedule.empty')}</AppText>}
      {schedules.map((s) => (
        <ScheduleCard key={s.id} schedule={s} profileName={profiles.find((p) => p.id === s.profileId)?.name ?? ''} />
      ))}
      <Button
        label={t('schedule.add')}
        onPress={() =>
          add({ profileId: selectedId, days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60, enabled: true })
        }
      />
    </Screen>
  );
}

function ScheduleCard({ schedule, profileName }: { schedule: Schedule; profileName: string }) {
  const { t } = useTranslation();
  const update = useAppStore((s) => s.updateSchedule);
  const remove = useAppStore((s) => s.removeSchedule);

  function toggleDay(day: number) {
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day];
    update(schedule.id, { days });
  }

  return (
    <Card>
      <View style={styles.between}>
        <AppText weight="600">{profileName}</AppText>
        <Switch
          accessibilityLabel={t('schedule.enabled')}
          value={schedule.enabled}
          onValueChange={(enabled) => update(schedule.id, { enabled })}
        />
      </View>
      <View style={styles.row}>
        {DAY_ORDER.map((d) => (
          <Chip key={d} label={t(`days.${d}`)} selected={schedule.days.includes(d)} onPress={() => toggleDay(d)} />
        ))}
      </View>
      <TimeStepper
        label={t('schedule.from')}
        minute={schedule.startMinute}
        onChange={(m) => update(schedule.id, { startMinute: m })}
      />
      <TimeStepper
        label={t('schedule.to')}
        minute={schedule.endMinute}
        onChange={(m) => update(schedule.id, { endMinute: m })}
      />
      <Button label={t('common.delete')} variant="secondary" onPress={() => remove(schedule.id)} />
    </Card>
  );
}

function TimeStepper({ label, minute, onChange }: { label: string; minute: number; onChange: (m: number) => void }) {
  return (
    <View style={styles.between}>
      <AppText muted>{label}</AppText>
      <View style={styles.stepper}>
        <Chip label="−" selected={false} onPress={() => onChange(shift(minute, -STEP))} />
        <AppText weight="600" style={styles.time}>
          {formatMinute(minute)}
        </AppText>
        <Chip label="+" selected={false} onPress={() => onChange(shift(minute, STEP))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  time: { minWidth: 56, textAlign: 'center' },
});

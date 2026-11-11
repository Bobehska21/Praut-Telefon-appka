import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, Screen, Heading, ThemedSwitch } from '@/components/ui';
import { FocusModule } from '@/modules/focus';
import { useAppStore, type Settings, type UnlockGuard } from '@/store';
import { spacing } from '@/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);

  const guards: { value: UnlockGuard; label: string }[] = [
    { value: 'none', label: t('settings.guardNone') },
    { value: 'countdown', label: t('settings.guardCountdown') },
    { value: 'sentence', label: t('settings.guardSentence') },
  ];
  const languages: { value: Settings['language']; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'cs', label: 'Čeština' },
    { value: 'en', label: 'English' },
  ];

  async function toggleAccessibility(on: boolean) {
    if (!on) return update({ accessibilityMode: false });
    // Only enable the setting once the system permission is actually granted.
    const state = await FocusModule.requestPermission('accessibility');
    update({ accessibilityMode: state === 'granted' });
  }

  return (
    <Screen>
      <Heading>{t('settings.title')}</Heading>

      <Card>
        <AppText weight="600">{t('settings.guard')}</AppText>
        <View style={styles.row}>
          {guards.map((g) => (
            <Chip key={g.value} label={g.label} selected={settings.unlockGuard === g.value} onPress={() => update({ unlockGuard: g.value })} />
          ))}
        </View>
      </Card>

      {FocusModule.platform !== 'ios' && (
        <Card>
          <View style={styles.between}>
            <AppText weight="600" style={styles.flex}>
              {t('settings.accessibility')}
            </AppText>
            <ThemedSwitch
              accessibilityLabel={t('settings.accessibility')}
              value={settings.accessibilityMode}
              onValueChange={toggleAccessibility}
            />
          </View>
          <AppText muted size={14}>
            {t('settings.accessibilityHint')}
          </AppText>
        </Card>
      )}

      <Card>
        <AppText weight="600">{t('settings.language')}</AppText>
        <View style={styles.row}>
          {languages.map((l) => (
            <Chip key={l.value} label={l.label} selected={settings.language === l.value} onPress={() => update({ language: l.value })} />
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, Chip, Screen, Heading, ThemedSwitch } from '@/components/ui';
import { checkNickname, NICKNAME_MAX } from '@/features/nickname';
import { usePermissions } from '@/features/permissions';
import { FocusModule } from '@/modules/focus';
import { useAppStore, type Settings, type UnlockGuard } from '@/store';
import { radius, spacing, useTheme } from '@/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const theme = useTheme();
  const { perms, loaded } = usePermissions();

  // What is typed may be wrong; only an allowed nickname is ever saved (and therefore sent to anyone).
  const [draft, setDraft] = useState(settings.nickname ?? '');
  const nicknameCheck = checkNickname(draft);
  const onNickname = (text: string) => {
    setDraft(text);
    const result = checkNickname(text);
    if (result === 'ok' || result === 'empty') update({ nickname: text.trim().replace(/\s+/g, ' ') });
  };

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

      {FocusModule.platform === 'android' && (
        <Card>
          <View style={styles.between}>
            <AppText weight="600" style={styles.flex}>
              {t('settings.nearbySwitch')}
            </AppText>
            <ThemedSwitch
              accessibilityLabel={t('settings.nearbySwitch')}
              value={settings.nearbyEnabled !== false}
              onValueChange={(nearbyEnabled) => update({ nearbyEnabled })}
            />
          </View>
          <AppText muted size={13}>
            {t('settings.nearbyHint')}
          </AppText>
          {loaded && perms.bluetooth !== 'granted' && (
            <>
              <AppText size={13} style={{ color: theme.danger }}>
                {t('settings.bluetoothMissing')}
              </AppText>
              <Button label={t('onboarding.grant')} onPress={() => void FocusModule.requestPermission('bluetooth')} />
            </>
          )}
          <AppText weight="600" style={styles.fieldLabel}>
            {t('settings.nickname')}
          </AppText>
          <TextInput
            value={draft}
            onChangeText={onNickname}
            maxLength={NICKNAME_MAX}
            autoCorrect={false}
            placeholder={t('settings.nickname')}
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              { color: theme.text, borderColor: nicknameCheck === 'blocked' || nicknameCheck === 'chars' ? theme.danger : theme.border },
            ]}
          />
          {nicknameCheck === 'blocked' && (
            <AppText size={13} style={{ color: theme.danger }}>
              {t('settings.nicknameBlocked')}
            </AppText>
          )}
          {nicknameCheck === 'chars' && (
            <AppText size={13} style={{ color: theme.danger }}>
              {t('settings.nicknameChars')}
            </AppText>
          )}
          <AppText muted size={12}>
            {t('settings.nicknameHint')}
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
  fieldLabel: { marginTop: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});

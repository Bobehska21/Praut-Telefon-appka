import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, Chip, Screen } from '@/components/ui';
import { usePermissions } from '@/features/permissions';
import { startFocus, stopFocus } from '@/features/session';
import { FocusModule } from '@/modules/focus';
import { useAppStore } from '@/store';
import { radius, spacing, useTheme } from '@/theme';

const PRESETS = [25, 50, 90] as const;
type Choice = number | 'custom' | 'open';

export default function HomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const profiles = useAppStore((s) => s.profiles);
  const selectedId = useAppStore((s) => s.selectedProfileId);
  const selectProfile = useAppStore((s) => s.selectProfile);
  const session = useAppStore((s) => s.session);
  const guard = useAppStore((s) => s.settings.unlockGuard);

  const [choice, setChoice] = useState<Choice>(25);
  const [customMin, setCustomMin] = useState('45');
  const [busy, setBusy] = useState(false);
  const { perms, loaded, missing } = usePermissions();

  const profile = profiles.find((p) => p.id === selectedId) ?? profiles[0];
  const hasApps =
    FocusModule.platform === 'ios' ? profile.selectionId !== null : profile.allowedAppIds.length > 0;
  const active = session !== null;

  /** `null` = until stopped, `undefined` = invalid input (start is disabled). */
  let durationMs: number | null | undefined;
  if (choice === 'open') {
    durationMs = null;
  } else {
    const minutes = choice === 'custom' ? Number.parseInt(customMin, 10) : choice;
    durationMs = Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : undefined;
  }

  async function onToggle() {
    if (busy) return;
    if (active) {
      if (guard === 'none') {
        setBusy(true);
        try {
          await stopFocus();
        } finally {
          setBusy(false);
        }
      } else {
        router.push('/unlock');
      }
      return;
    }
    // Focus mode must not start without the permissions that make it hold.
    if (durationMs === undefined || missing.length > 0) return;
    setBusy(true);
    try {
      await startFocus(profile.id, durationMs);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.center}>
        <AppText muted>{active ? t('home.active') : t('home.inactive')}</AppText>
        {active && session.endsAt !== null && (
          <AppText muted size={14}>
            {t('home.until', {
              time: new Date(session.endsAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </AppText>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? t('home.stop') : t('home.start')}
          onPress={onToggle}
          style={[
            styles.bigButton,
            {
              backgroundColor: active ? theme.surface : theme.primary,
              borderColor: active ? theme.primary : 'transparent',
              opacity: busy || (!active && missing.length > 0) ? 0.45 : 1,
            },
          ]}>
          <AppText size={28} weight="700" style={{ color: active ? theme.primary : theme.onPrimary }}>
            {active ? t('home.stop') : t('home.start')}
          </AppText>
        </Pressable>
      </View>

      {active && FocusModule.platform === 'android' && loaded && perms.accessibility !== 'granted' && (
        <Card>
          <AppText weight="600" style={{ color: theme.danger }}>
            {t('home.accessibilityLostTitle')}
          </AppText>
          <AppText muted size={14}>
            {t('home.accessibilityLostBody')}
          </AppText>
          <Button label={t('onboarding.grant')} onPress={() => void FocusModule.requestPermission('accessibility')} />
        </Card>
      )}

      {!active && loaded && missing.length > 0 && (
        <Card>
          <AppText weight="600">{t('home.missingTitle')}</AppText>
          {missing.map((name) => (
            <View key={name} style={styles.missingRow}>
              <AppText size={14} style={styles.flex}>
                {t(`onboarding.permissions.${name}.title`)}
              </AppText>
              <Button label={t('onboarding.grant')} onPress={() => void FocusModule.requestPermission(name)} />
            </View>
          ))}
        </Card>
      )}

      {!active && (
        <>
          <Card>
            <AppText muted size={14}>
              {t('home.profile')}
            </AppText>
            <View style={styles.row}>
              {profiles.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={p.id === profile.id}
                  onPress={() => selectProfile(p.id)}
                />
              ))}
            </View>
            {!hasApps && (
              <AppText muted size={14}>
                {t('home.noAppsWarning')}
              </AppText>
            )}
          </Card>

          <Card>
            <AppText muted size={14}>
              {t('home.duration')}
            </AppText>
            <View style={styles.row}>
              {PRESETS.map((m) => (
                <Chip
                  key={m}
                  label={t('home.minutes', { count: m })}
                  selected={choice === m}
                  onPress={() => setChoice(m)}
                />
              ))}
              <Chip label={t('home.custom')} selected={choice === 'custom'} onPress={() => setChoice('custom')} />
              <Chip label={t('home.untilStopped')} selected={choice === 'open'} onPress={() => setChoice('open')} />
            </View>
            {choice === 'custom' && (
              <TextInput
                value={customMin}
                onChangeText={(v) => setCustomMin(v.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="number-pad"
                accessibilityLabel={t('home.custom')}
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  bigButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    fontSize: 16,
  },
});

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Chip, Screen } from '@/components/ui';
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
    if (durationMs === undefined) return;
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
              opacity: busy ? 0.6 : 1,
            },
          ]}>
          <AppText size={28} weight="700" style={{ color: active ? theme.primary : theme.onPrimary }}>
            {active ? t('home.stop') : t('home.start')}
          </AppText>
        </Pressable>
      </View>

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
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    fontSize: 16,
  },
});

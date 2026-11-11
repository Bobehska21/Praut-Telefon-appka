import { Ionicons } from '@expo/vector-icons';
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
        <View style={[styles.ring, { borderColor: active ? theme.primary : theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={active ? t('home.stop') : t('home.start')}
            onPress={onToggle}
            style={[
              styles.bigButton,
              {
                backgroundColor: active ? theme.background : theme.primary,
                borderColor: theme.primary,
                shadowColor: theme.primary,
                opacity: busy || (!active && missing.length > 0) ? 0.45 : 1,
              },
            ]}>
            <Ionicons name={active ? 'stop-circle-outline' : 'power'} size={54} color={active ? theme.accent : theme.onPrimary} />
            <AppText weight="700" size={18} style={[styles.bigLabel, { color: active ? theme.accent : theme.onPrimary }]}>
              {(active ? t('home.stop') : t('home.start')).toLocaleUpperCase()}
            </AppText>
          </Pressable>
        </View>
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
  // Thin outer ring, then the button itself with a soft red glow (iOS shadow / Android elevation).
  ring: {
    width: 248,
    height: 248,
    borderRadius: 124,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  bigButton: {
    width: 204,
    height: 204,
    borderRadius: 102,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  bigLabel: { letterSpacing: 4 },
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

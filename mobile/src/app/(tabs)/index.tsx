import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, Chip, ProgressBar, Screen } from '@/components/ui';
import { FocusRing } from '@/components/focus-ring';
import { ServerStatusCard } from '@/components/ServerStatusCard';
import { BET_MULTIPLIERS, betMinMinutes, betProblem, type BetMultiplier } from '@/features/bets';
import { fetchStats } from '@/features/multiplayer/service';
import { usePermissions } from '@/features/permissions';
import { dailyGoal } from '@/features/progress/daily-goal';
import { snapshot } from '@/features/progress/engine';
import { withLiveSession } from '@/features/progress/live';
import { startFocus, stopFocus } from '@/features/session';
import { FocusModule } from '@/modules/focus';
import { useAppStore } from '@/store';
import { radius, spacing, useTheme } from '@/theme';

const PRESETS = [25, 50, 90] as const;
const RING = 248;

/** `m:ss`, or `h:mm:ss` past an hour. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
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
  const sessions = useAppStore((s) => s.sessions);
  const claimed = useAppStore((s) => s.claimed);
  const achievements = useAppStore((s) => s.achievements);

  const [choice, setChoice] = useState<Choice>(25);
  const [customMin, setCustomMin] = useState('45');
  const [bet, setBet] = useState<BetMultiplier>(1);
  const [stake, setStake] = useState('100');
  const [pointsToday, setPointsToday] = useState(0);
  const nearbyEnabled = useAppStore((s) => s.settings.nearbyEnabled !== false);
  const [busy, setBusy] = useState(false);
  const { perms, loaded, missing } = usePermissions();

  // Once a second while a timed session runs (ring and countdown), otherwise every 30 s. The slow
  // tick is what rolls the daily goal over at local midnight without the user doing anything.
  const [now, setNow] = useState(() => Date.now());
  const timed = session !== null && session.endsAt !== null;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), timed ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [timed]);

  // Compact summary of today's quests and the current rank, shown above the duration picker.
  const liveSessions = useMemo(() => withLiveSession(sessions, session, now), [sessions, session, now]);
  const progress = useMemo(
    () => snapshot({ sessions: liveSessions, claimed, achievements }, now),
    [liveSessions, claimed, achievements, now],
  );
  const goal = useMemo(() => dailyGoal(liveSessions, now), [liveSessions, now]);
  const questsDone = progress.daily.filter((q) => q.done).length;

  // The idle start button breathes slowly, unless the user asked the system for less motion.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  const [pulse] = useState(() => new Animated.Value(1));
  const canPulse = session === null && missing.length === 0 && !reduceMotion;
  useEffect(() => {
    if (!canPulse) {
      pulse.setValue(1);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(pulse, { toValue, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([step(1.04), step(1)]));
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [canPulse, pulse]);

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

  // Bets are an Android multiplayer feature: the server settles them.
  const betsVisible = FocusModule.platform === 'android' && nearbyEnabled;
  const betActive = betsVisible ? bet : 1;
  const stakePoints = Number.parseInt(stake, 10);
  const problem = betProblem(betActive, Number.isFinite(stakePoints) ? stakePoints : 0, durationMs, pointsToday);
  const betBlocked = problem !== null;

  // The stake can never exceed the points earned today, so read them whenever the screen is shown.
  useFocusEffect(
    useCallback(() => {
      if (!betsVisible) return;
      let alive = true;
      fetchStats().then((s) => alive && setPointsToday(s.pointsToday)).catch(() => {});
      return () => {
        alive = false;
      };
    }, [betsVisible]),
  );

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
    if (durationMs === undefined || missing.length > 0 || betBlocked) return;
    setBusy(true);
    try {
      await startFocus(profile.id, durationMs, betActive > 1 ? { multiplier: betActive, stakePoints } : undefined);
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
        <View style={styles.ring}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <FocusRing
              size={RING}
              stroke={4}
              // Open-ended sessions have no end to count down to: show the ring full.
              progress={active ? (session.endsAt === null ? 1 : Math.min(1, Math.max(0, (session.endsAt - now) / (session.endsAt - session.startedAt)))) : null}
              color={theme.accent}
              trackColor={theme.border}
            />
          </View>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
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
                opacity: busy || (!active && (missing.length > 0 || betBlocked)) ? 0.45 : 1,
              },
            ]}>
            <Ionicons name={active ? 'stop-circle-outline' : 'power'} size={54} color={active ? theme.accent : theme.onPrimary} />
            <AppText weight="700" size={18} style={[styles.bigLabel, { color: active ? theme.accent : theme.onPrimary }]}>
              {(active ? t('home.stop') : t('home.start')).toLocaleUpperCase()}
            </AppText>
            {active && session.endsAt !== null && (
              <AppText accent size={15} weight="600">
                {formatRemaining(session.endsAt - now)}
              </AppText>
            )}
          </Pressable>
          </Animated.View>
        </View>
      </View>

      {betsVisible && <ServerStatusCard />}

      <Card>
        <View style={styles.between}>
          <AppText weight="600">{t('home.goalTitle')}</AppText>
          <AppText accent={goal.reached} muted={!goal.reached} size={13} weight="700">
            {goal.reached
              ? t('home.goalReached')
              : t('home.goalProgress', { minutes: goal.minutes, goal: goal.goal })}
          </AppText>
        </View>
        <ProgressBar fraction={goal.fraction} height={10} />
        {goal.reached ? (
          <AppText accent weight="700" size={16}>
            {t('home.bonus', { count: goal.bonus })}
          </AppText>
        ) : (
          <AppText muted size={13}>
            {t('home.goalLeft', { minutes: goal.goal - goal.minutes })}
          </AppText>
        )}
        <AppText muted size={12}>
          {t('home.bonusHint')}
        </AppText>
      </Card>

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

          <Pressable accessibilityRole="button" onPress={() => router.navigate('/progress')}>
            <Card>
              <View style={styles.between}>
                <AppText weight="600">
                  {t('progress.summary', { done: questsDone, total: progress.daily.length })}
                </AppText>
                <AppText accent size={13} weight="700">
                  {t(`progress.rank.${progress.rank}`)} · {progress.level.level}
                </AppText>
              </View>
              <ProgressBar fraction={progress.daily.length ? questsDone / progress.daily.length : 0} />
            </Card>
          </Pressable>

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
            {betsVisible && (
              <>
                <AppText muted size={14}>
                  {t('home.bet')}
                </AppText>
                <View style={styles.row}>
                  {BET_MULTIPLIERS.map((m) => (
                    <Chip key={m} label={`${m}×`} selected={bet === m} onPress={() => setBet(m)} />
                  ))}
                </View>
                {bet > 1 && (
                  <>
                    <AppText muted size={14}>
                      {t('home.betStake', { max: Math.max(0, pointsToday) })}
                    </AppText>
                    <TextInput
                      value={stake}
                      onChangeText={(v) => setStake(v.replace(/[^0-9]/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      accessibilityLabel={t('home.betStake', { max: Math.max(0, pointsToday) })}
                      style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    />
                    <AppText muted size={12}>
                      {problem
                        ? t(`home.betProblem.${problem}`, { minutes: betMinMinutes(bet), max: Math.max(0, pointsToday) })
                        : t('home.betHint', { stake: stakePoints, win: stakePoints * (bet - 1), multiplier: bet })}
                    </AppText>
                  </>
                )}
              </>
            )}
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
    width: RING,
    height: RING,
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
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    fontSize: 16,
  },
});

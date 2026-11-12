import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { AppText, Button, Card, Chip, Heading, Screen } from '@/components/ui';
import { formatDuration } from '@/features/stats';
import {
  blockPlayer,
  chooseAndUploadPhoto,
  fetchLeaderboard,
  fetchMe,
  fetchStats,
  logoutAccount,
  killPlayer,
  leaveMultiplayer,
  listBlocked,
  refreshNearby,
  removePhoto,
  reportPlayer,
  syncProfile,
  unblockPlayer,
} from '@/features/multiplayer/service';
import { errorText } from '@/features/multiplayer/errors';
import { useMultiplayerStore } from '@/features/multiplayer/store';
import type { BlockedPlayer, Leaderboard, MyProfile, MyStats, NearbyPlayer, ReportKind } from '@/features/multiplayer/types';
import { usePermissions } from '@/features/permissions';
import { FocusModule } from '@/modules/focus';
import { radius, spacing, useTheme } from '@/theme';

type Tab = 'nearby' | 'leaderboard' | 'me';

export default function PlayersScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('nearby');

  if (FocusModule.platform !== 'android') {
    return (
      <Screen>
        <Heading>{t('players.title')}</Heading>
        <AppText muted>{t('players.androidOnly')}</AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading>{t('players.title')}</Heading>
      <View style={styles.tabs}>
        {(['nearby', 'leaderboard', 'me'] as const).map((key) => (
          <Chip key={key} label={t(`players.tabs.${key}`)} selected={tab === key} onPress={() => setTab(key)} />
        ))}
      </View>
      {tab === 'nearby' && <NearbyTab />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'me' && <MeTab />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------------- nearby

function NearbyTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { perms, loaded } = usePermissions();
  const [players, setPlayers] = useState<NearbyPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [killing, setKilling] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<NearbyPlayer | null>(null);
  const [reportFor, setReportFor] = useState<NearbyPlayer | null>(null);

  const load = useCallback(async () => {
    try {
      setPlayers(await refreshNearby());
      setError(null);
    } catch (e) {
      setError(errorText(t, e));
    }
    setNow(Date.now());
  }, [t]);

  // The list refreshes by itself while this screen is open. There are deliberately no notifications
  // about new wastemen: players watch the list themselves.
  useFocusEffect(
    useCallback(() => {
      void load();
      const id = setInterval(() => void load(), 6000);
      return () => clearInterval(id);
    }, [load]),
  );

  async function kill(player: NearbyPlayer) {
    setKilling(player.playerId);
    try {
      const result = await killPlayer(player);
      Alert.alert(t('players.killed', { name: player.nickname || t('players.anonymous') }), t('players.killedPoints', { points: result.pointsGained }));
    } catch (e) {
      Alert.alert(t('players.killFailed'), errorText(t, e));
    } finally {
      setKilling(null);
      void load();
    }
  }

  return (
    <>
      {loaded && perms.bluetooth !== 'granted' && (
        <Card>
          <AppText size={13} style={{ color: theme.danger }}>
            {t('players.needBluetooth')}
          </AppText>
          <Button label={t('onboarding.grant')} onPress={() => void FocusModule.requestPermission('bluetooth')} />
        </Card>
      )}
      {error && (
        <AppText size={13} style={{ color: theme.danger }}>
          {error}
        </AppText>
      )}
      {players.length === 0 && !error && <AppText muted>{t('players.nobody')}</AppText>}
      {players.map((p) => (
        <Card key={p.token}>
          <View style={styles.row}>
            <Avatar photoUrl={p.photoUrl} size={52} />
            <View style={styles.flex}>
              <AppText weight="700">{p.nickname || t('players.anonymous')}</AppText>
              <AppText muted size={13}>
                {t(`progress.rank.${p.rankKey}`)} · {t('progress.level', { level: p.level })}
              </AppText>
              <StatusBadge player={p} now={now} />
            </View>
            <Pressable accessibilityLabel={t('players.more')} onPress={() => setMenuFor(p)} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
          {p.status === 'wasteman' && <KillButton player={p} busy={killing === p.playerId} onKill={() => kill(p)} />}
        </Card>
      ))}

      <Modal transparent animationType="fade" visible={menuFor !== null} onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuFor(null)}>
          <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Button
              label={t('players.block')}
              variant="secondary"
              onPress={async () => {
                const target = menuFor;
                setMenuFor(null);
                if (!target) return;
                await blockPlayer(target.playerId).catch(() => undefined);
                void load();
              }}
            />
            <Button
              label={t('players.report')}
              variant="secondary"
              onPress={() => {
                setReportFor(menuFor);
                setMenuFor(null);
              }}
            />
          </View>
        </Pressable>
      </Modal>
      <ReportSheet player={reportFor} onClose={() => setReportFor(null)} />
    </>
  );
}

function StatusBadge({ player, now }: { player: NearbyPlayer; now: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const color = player.status === 'wasteman' ? theme.danger : player.status === 'focus' ? theme.accent : theme.textMuted;
  let label = t(`players.status.${player.status}`);
  if (player.status === 'immune' && player.immuneUntil) {
    label = t('players.immuneLeft', { time: formatDuration(Math.max(0, new Date(player.immuneUntil).getTime() - now)) });
  }
  return (
    <AppText size={13} weight="700" style={{ color }}>
      {label}
    </AppText>
  );
}

function KillButton({ player, busy, onKill }: { player: NearbyPlayer; busy: boolean; onKill: () => void }) {
  const { t } = useTranslation();
  if (player.canKill) {
    return <Button label={busy ? t('players.killing') : t('players.kill')} variant="danger" onPress={onKill} disabled={busy} />;
  }
  // Shown disabled, with the reason, so the player knows what is missing.
  const reason =
    player.killBlockedReason === 'needs_minutes'
      ? t('players.killMissing', { minutes: player.missingMinutes })
      : t(`players.errors.${player.killBlockedReason ?? 'unknown'}`);
  return (
    <>
      <Button label={t('players.kill')} variant="danger" onPress={() => undefined} disabled />
      <AppText muted size={12}>
        {reason}
      </AppText>
    </>
  );
}

function ReportSheet({ player, onClose }: { player: NearbyPlayer | null; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const send = async (kind: ReportKind) => {
    if (!player) return;
    onClose();
    try {
      await reportPlayer(player.playerId, kind);
      Alert.alert(t('players.reportThanks'));
    } catch (e) {
      Alert.alert(errorText(t, e));
    }
  };
  return (
    <Modal transparent animationType="fade" visible={player !== null} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText weight="700">{t('players.reportTitle')}</AppText>
          <Button label={t('players.reportNickname')} variant="secondary" onPress={() => void send('nickname')} />
          <Button label={t('players.reportPhoto')} variant="secondary" onPress={() => void send('photo')} />
          <Button label={t('players.reportPlayer')} variant="secondary" onPress={() => void send('player')} />
        </View>
      </Pressable>
    </Modal>
  );
}

// ------------------------------------------------------------------------------ leaderboard

function LeaderboardTab() {
  const { t } = useTranslation();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchLeaderboard()
        .then((b) => alive && (setBoard(b), setError(null)))
        .catch((e) => alive && setError(errorText(t, e)));
      return () => {
        alive = false;
      };
    }, [t]),
  );

  return (
    <>
      <AppText weight="700" muted size={13}>
        {t('players.leaderboardTitle').toLocaleUpperCase()}
      </AppText>
      {error && <AppText size={13}>{error}</AppText>}
      {board && board.entries.length === 0 && <AppText muted>{t('players.empty')}</AppText>}
      {board?.entries.map((e) => (
        <Card key={e.playerId}>
          <View style={styles.row}>
            <AppText accent weight="700" style={styles.place}>
              {e.rank}.
            </AppText>
            <Avatar photoUrl={e.photoUrl} size={40} />
            <View style={styles.flex}>
              <AppText weight="600">{e.nickname || t('players.anonymous')}</AppText>
              <AppText muted size={12}>
                {t(`progress.rank.${e.rankKey}`)}
              </AppText>
            </View>
            <AppText weight="700">{t('players.kills', { count: e.kills })}</AppText>
          </View>
        </Card>
      ))}
      {board?.me && !board.entries.some((e) => e.playerId === board.me?.playerId) && (
        <Card>
          <View style={styles.row}>
            <AppText accent weight="700" style={styles.place}>
              {board.me.rank}.
            </AppText>
            <AppText weight="600" style={styles.flex}>
              {t('players.you')}
            </AppText>
            <AppText weight="700">{t('players.kills', { count: board.me.kills })}</AppText>
          </View>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------- me

function MeTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [blocked, setBlocked] = useState<BlockedPlayer[]>([]);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const [m, s, b] = await Promise.all([fetchMe(), fetchStats(), listBlocked()]);
      if (!alive.current) return;
      setMe(m);
      setStats(s);
      setBlocked(b.blocked);
      setError(null);
    } catch (e) {
      if (alive.current) setError(errorText(t, e));
    }
  }, [t]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function photo(source: 'gallery' | 'camera') {
    try {
      if (await chooseAndUploadPhoto(source)) {
        setPhotoVersion((v) => v + 1);
        void load();
      }
    } catch (e) {
      Alert.alert(errorText(t, e));
    }
  }

  function leave() {
    Alert.alert(t('players.me.leave'), t('players.me.leaveConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void leaveMultiplayer().catch((e) => Alert.alert(errorText(t, e))) },
    ]);
  }

  return (
    <>
      {error && <AppText size={13} style={{ color: theme.danger }}>{error}</AppText>}
      <Card>
        <View style={styles.row}>
          <Avatar photoUrl={me?.photoUrl ?? null} size={72} version={photoVersion} />
          <View style={styles.flex}>
            <AppText weight="700" size={18}>
              {me?.nickname || t('players.anonymous')}
            </AppText>
            <AppText muted size={13}>
              {me ? `${t(`progress.rank.${me.rankKey}`)} · ${t('progress.level', { level: me.level })}` : ''}
            </AppText>
          </View>
        </View>
        <AppText weight="600" size={13} muted>
          {t('players.me.photo').toLocaleUpperCase()}
        </AppText>
        <View style={styles.rowWrap}>
          <Chip label={t('players.me.gallery')} selected={false} onPress={() => void photo('gallery')} />
          <Chip label={t('players.me.camera')} selected={false} onPress={() => void photo('camera')} />
          {me?.photoUrl && (
            <Chip
              label={t('players.me.remove')}
              selected={false}
              onPress={() => void removePhoto().then(() => (setPhotoVersion((v) => v + 1), load())).catch((e) => Alert.alert(errorText(t, e)))}
            />
          )}
        </View>
      </Card>

      {stats && (
        <Card>
          <AppText weight="600" size={13} muted>
            {t('players.me.stats').toLocaleUpperCase()}
          </AppText>
          <StatLine label={t('players.me.killsToday')} value={stats.killsToday} />
          <StatLine label={t('players.me.killsTotal')} value={stats.killsTotal} />
          <StatLine label={t('players.me.deathsToday')} value={stats.deathsToday} />
          <StatLine label={t('players.me.deathsTotal')} value={stats.deathsTotal} />
          <StatLine label={t('players.me.pointsToday')} value={stats.pointsToday} />
          <StatLine label={t('players.me.pointsTotal')} value={stats.pointsTotal} />
        </Card>
      )}

      <Card>
        <AppText weight="600" size={13} muted>
          {t('players.blockedPlayers').toLocaleUpperCase()}
        </AppText>
        {blocked.length === 0 && <AppText muted size={13}>{t('players.noBlocked')}</AppText>}
        {blocked.map((b) => (
          <View key={b.playerId} style={styles.row}>
            <AppText style={styles.flex}>{b.nickname || t('players.anonymous')}</AppText>
            <Chip label={t('players.unblock')} selected={false} onPress={() => void unblockPlayer(b.playerId).then(load)} />
          </View>
        ))}
      </Card>

      <Card>
        <AppText weight="600" size={13} muted>
          {t('players.me.server').toLocaleUpperCase()}
        </AppText>
        <ServerUrlField onSaved={() => void syncProfile().then(load).catch(() => undefined)} />
      </Card>

      <Button label={t('auth.logout')} variant="secondary" onPress={() => void logoutAccount()} />
      <Button label={t('players.me.leave')} variant="secondary" onPress={leave} />
    </>
  );
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.between}>
      <AppText muted size={14}>
        {label}
      </AppText>
      <AppText weight="700">{value}</AppText>
    </View>
  );
}

function ServerUrlField({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const url = useMultiplayerStore((s) => s.serverUrl);
  const set = useMultiplayerStore((s) => s.setServerUrl);
  return (
    <>
      <AppText muted size={12}>
        {url}
      </AppText>
      <Button
        label={t('players.me.serverReset')}
        variant="secondary"
        onPress={() => {
          set('http://localhost:3000');
          onSaved();
        }}
      />
    </>
  );
}

// ------------------------------------------------------------------------------------- helpers

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  place: { width: 28 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { margin: spacing.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg },
});

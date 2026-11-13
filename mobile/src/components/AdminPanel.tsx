import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, Chip } from '@/components/ui';
import { adminAdjustPoints, adminListPlayers, adminWhoami, devAddMinutes, devSetShields, parsePoints, type AdminPlayer } from '@/features/admin';
import { ApiError } from '@/features/multiplayer/api';
import { useMultiplayerStore } from '@/features/multiplayer/store';
import { radius, spacing, useTheme } from '@/theme';

/**
 * Admin tools. Shown only when the SERVER says the signed-in account is an admin (`whoami`); hiding it is a
 * convenience, not the protection: every admin request is authorized again on the server.
 */
export function AdminPanel() {
  const { t } = useTranslation();
  const theme = useTheme();
  const joined = useMultiplayerStore((s) => s.joined);
  const [admin, setAdmin] = useState(false);
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [selected, setSelected] = useState<AdminPlayer | null>(null);
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!joined) return;
    let alive = true;
    adminWhoami().then(() => alive && setAdmin(true), () => alive && setAdmin(false));
    return () => {
      alive = false;
    };
  }, [joined]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const timer = setTimeout(() => adminListPlayers(query).then((p) => alive && setPlayers(p), () => undefined), 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [admin, query]);

  if (!joined || !admin) return null;

  const parsed = parsePoints(points);
  const fail = (e: unknown) => setMessage(e instanceof ApiError && e.code === 'network' ? t('settings.adminOffline') : t('settings.adminFailed'));

  async function submit() {
    if (!selected || parsed === null) return;
    try {
      const r = await adminAdjustPoints(selected.id, parsed, note);
      setMessage(t('settings.adminPointsDone', { name: selected.nickname || selected.username, today: r.pointsToday }));
      setPoints('');
      setNote('');
      setSelected(null);
      setPlayers(await adminListPlayers(query));
    } catch (e) {
      fail(e);
    }
  }

  const field = (value: string, set: (v: string) => void, placeholder: string, extra: object = {}) => (
    <TextInput
      value={value}
      onChangeText={set}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.input, { color: theme.text, borderColor: theme.border }]}
      {...extra}
    />
  );

  return (
    <>
      <Card>
        <AppText weight="600">{t('settings.adminPoints')}</AppText>
        {field(query, setQuery, t('settings.adminSearch'))}
        <View style={styles.row}>
          {players.map((p) => (
            <Chip
              key={p.id}
              label={`${p.nickname || p.username || '?'} · ${p.pointsTotal}`}
              selected={selected?.id === p.id}
              onPress={() => setSelected(p)}
            />
          ))}
        </View>
        {selected && (
          <>
            <AppText size={13} muted>
              {t('settings.adminSelected', { name: selected.nickname || selected.username, username: selected.username ?? '-', points: selected.pointsTotal })}
            </AppText>
            {field(points, setPoints, t('settings.adminAmount'), { keyboardType: 'numbers-and-punctuation' })}
            {field(note, setNote, t('settings.adminNote'), { maxLength: 200 })}
            <Button label={t('settings.adminApply')} onPress={() => void submit()} disabled={parsed === null} />
          </>
        )}
        {message !== '' && <AppText size={13}>{message}</AppText>}
      </Card>

      <Card>
        <AppText weight="600">{t('settings.adminTitle')}</AppText>
        <AppText muted size={13}>
          {t('settings.adminHint')}
        </AppText>
        <View style={styles.row}>
          {[15, 60, 100, 300].map((m) => (
            <Button key={m} label={`+${m} min`} onPress={() => void devAddMinutes(m, true).then((r) => setMessage(t('settings.adminDone', { minutes: r.focusMinutesToday, shields: r.shields })), () => setMessage(t('settings.adminNoDev')))} />
          ))}
        </View>
        <View style={styles.row}>
          {[0, 1, 2, 3].map((n) => (
            <Button key={n} label={t('settings.adminShieldsN', { count: n })} onPress={() => void devSetShields(n).then((r) => setMessage(t('settings.adminDone', { minutes: '-', shields: r.shields })), () => setMessage(t('settings.adminNoDev')))} />
          ))}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

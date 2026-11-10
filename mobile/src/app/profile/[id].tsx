import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { FocusModule, type InstalledApp } from '@/modules/focus';
import { useAppStore } from '@/store';
import { radius, spacing, useTheme } from '@/theme';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useAppStore((s) => s.profiles.find((p) => p.id === id));
  const isIos = FocusModule.platform === 'ios';

  if (!profile) return null;
  return (
    <>
      <Stack.Screen options={{ title: profile.name }} />
      {isIos ? <IosPicker profileId={profile.id} /> : <AppList profileId={profile.id} />}
    </>
  );
}

function ProfileHeader({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profile = useAppStore((s) => s.profiles.find((p) => p.id === profileId))!;
  const canDelete = useAppStore((s) => s.profiles.length > 1 && s.session?.profileId !== profileId);
  const rename = useAppStore((s) => s.renameProfile);
  const remove = useAppStore((s) => s.deleteProfile);

  return (
    <View style={{ gap: spacing.sm }}>
      <TextInput
        value={profile.name}
        onChangeText={(v) => rename(profileId, v.slice(0, 30))}
        accessibilityLabel={t('profiles.name')}
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
      />
      <AppText muted size={14}>
        {t('profiles.alwaysAllowed')}
      </AppText>
      {canDelete && (
        <Button
          label={t('common.delete')}
          variant="secondary"
          onPress={() => {
            remove(profileId);
            router.back();
          }}
        />
      )}
    </View>
  );
}

function AppList({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const allowed = useAppStore((s) => s.profiles.find((p) => p.id === profileId)?.allowedAppIds ?? []);
  const toggle = useAppStore((s) => s.toggleApp);

  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void FocusModule.getInstalledApps().then((list) =>
      setApps([...list].sort((a, b) => a.label.localeCompare(b.label))),
    );
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? apps.filter((a) => a.label.toLocaleLowerCase().includes(q)) : apps;
  }, [apps, query]);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <FlatList
        data={visible}
        keyExtractor={(a) => a.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <ProfileHeader profileId={profileId} />
            <AppText weight="600">{t('profiles.apps')}</AppText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('common.search')}
              placeholderTextColor={theme.textMuted}
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />
          </View>
        }
        renderItem={({ item }) => {
          const checked = allowed.includes(item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => toggle(profileId, item.id)}
              style={[styles.row, { borderColor: theme.border }]}>
              {item.iconUri ? (
                <Image source={{ uri: item.iconUri }} style={styles.icon} />
              ) : (
                <View style={[styles.icon, { backgroundColor: theme.border }]} />
              )}
              <AppText style={styles.flex}>{item.label}</AppText>
              <AppText weight="700" style={{ color: checked ? theme.primary : theme.textMuted }}>
                {checked ? '✓' : '○'}
              </AppText>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function IosPicker({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const profile = useAppStore((s) => s.profiles.find((p) => p.id === profileId))!;
  const setSelection = useAppStore((s) => s.setSelection);

  async function pick() {
    const result = await FocusModule.pickAllowedApps(profileId);
    if (result) setSelection(profileId, result.selectionId, result.appCount);
  }

  return (
    <Screen>
      <ProfileHeader profileId={profileId} />
      <Card>
        <AppText weight="600">{t('profiles.appsCount', { count: profile.selectionCount })}</AppText>
        <AppText muted size={14}>
          {t('profiles.iosHint')}
        </AppText>
      </Card>
      <Button label={t('profiles.pickIos')} onPress={pick} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 36, height: 36, borderRadius: 8 },
});

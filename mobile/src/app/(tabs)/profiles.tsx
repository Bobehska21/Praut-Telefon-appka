import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, Screen, Heading } from '@/components/ui';
import { FocusModule } from '@/modules/focus';
import { useAppStore } from '@/store';
import { radius, spacing, useTheme } from '@/theme';

export default function ProfilesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profiles = useAppStore((s) => s.profiles);
  const addProfile = useAppStore((s) => s.addProfile);
  const [name, setName] = useState('');

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addProfile(trimmed);
    setName('');
    router.push({ pathname: '/profile/[id]', params: { id } });
  }

  return (
    <Screen>
      <Heading>{t('profiles.title')}</Heading>
      {profiles.map((p) => {
        const count = FocusModule.platform === 'ios' ? p.selectionCount : p.allowedAppIds.length;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/profile/[id]', params: { id: p.id } })}>
            <Card>
              <AppText weight="600">{p.name}</AppText>
              <AppText muted size={14}>
                {t('profiles.appsCount', { count })}
              </AppText>
            </Card>
          </Pressable>
        );
      })}
      <View style={styles.row}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('profiles.name')}
          placeholderTextColor={theme.textMuted}
          maxLength={30}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
        <Button label={t('profiles.new')} onPress={create} disabled={!name.trim()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
});

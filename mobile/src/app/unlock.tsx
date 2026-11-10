import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { countdownRemaining, isSentenceMatch } from '@/features/unlock-guard';
import { stopFocus } from '@/features/session';
import { useAppStore } from '@/store';
import { radius, spacing, useTheme } from '@/theme';

export default function UnlockScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const guard = useAppStore((s) => s.settings.unlockGuard);

  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(openedAt);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const sentence = t('unlock.sentenceText');
  const remaining = countdownRemaining(openedAt, now);
  const allowed =
    guard === 'none' ||
    (guard === 'countdown' && remaining === 0) ||
    (guard === 'sentence' && isSentenceMatch(typed, sentence));

  async function confirm() {
    if (!allowed || busy) return;
    setBusy(true);
    try {
      await stopFocus();
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false}>
      <AppText size={24} weight="700">
        {t('unlock.title')}
      </AppText>
      {guard === 'countdown' && <AppText muted>{t('unlock.countdown', { seconds: remaining })}</AppText>}
      {guard === 'sentence' && (
        <>
          <AppText muted>{t('unlock.sentence')}</AppText>
          <AppText weight="600">{sentence}</AppText>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={t('unlock.sentence')}
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          />
        </>
      )}
      <Button label={t('unlock.keepGoing')} onPress={() => router.back()} />
      <Button label={t('unlock.confirm')} variant="secondary" disabled={!allowed || busy} onPress={confirm} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
});

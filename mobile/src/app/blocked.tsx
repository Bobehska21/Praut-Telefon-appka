import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { spacing } from '@/theme';

/** Shown when the user lands in a blocked app flow. On Android the native overlay mirrors this text. */
export default function BlockedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <AppText size={22} weight="700" style={styles.text}>
          {t('blocked.message')}
        </AppText>
        <Button label={t('blocked.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  text: { textAlign: 'center' },
});

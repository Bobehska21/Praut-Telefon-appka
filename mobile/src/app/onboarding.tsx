import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { FocusModule, type PermissionName, type PermissionMap } from '@/modules/focus';
import { useAppStore } from '@/store';

const ANDROID_STEPS: PermissionName[] = [
  'usageAccess',
  'overlay',
  'notifications',
  'batteryOptimization',
  'defaultLauncher',
  'exactAlarm',
];
const IOS_STEPS: PermissionName[] = ['screenTime'];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const updateSettings = useAppStore((s) => s.updateSettings);

  const steps = FocusModule.platform === 'ios' ? IOS_STEPS : ANDROID_STEPS;
  const [index, setIndex] = useState(-1); // -1 = welcome
  const [perms, setPerms] = useState<PermissionMap>({});

  // Most permissions are granted on a system settings screen, so the answer is only
  // known when the user comes back to the app.
  useEffect(() => {
    const refresh = () => void FocusModule.getPermissions().then(setPerms);
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, []);

  const step = index >= 0 ? steps[index] : null;
  const isLast = index === steps.length - 1;

  function next() {
    if (isLast) {
      updateSettings({ onboardingDone: true });
      router.replace('/');
    } else {
      setIndex((i) => i + 1);
    }
  }

  async function grant(name: PermissionName) {
    const state = await FocusModule.requestPermission(name);
    setPerms((p) => ({ ...p, [name]: state }));
  }

  if (step === null) {
    return (
      <Screen>
        <AppText size={28} weight="700">
          {t('onboarding.welcomeTitle')}
        </AppText>
        <AppText muted>{t('onboarding.welcomeBody')}</AppText>
        <Button label={t('common.continue')} onPress={() => setIndex(0)} />
      </Screen>
    );
  }

  const granted = perms[step] === 'granted';
  return (
    <Screen>
      <AppText muted size={14}>
        {index + 1} / {steps.length}
      </AppText>
      <Card>
        <AppText size={20} weight="600">
          {t(`onboarding.permissions.${step}.title`)}
        </AppText>
        <AppText muted>{t(`onboarding.permissions.${step}.why`)}</AppText>
      </Card>
      <View style={{ gap: 12 }}>
        {granted ? (
          <AppText weight="600">{t('onboarding.granted')}</AppText>
        ) : (
          <Button label={t('onboarding.grant')} onPress={() => grant(step)} />
        )}
        <Button
          label={granted ? (isLast ? t('onboarding.finish') : t('common.continue')) : t('onboarding.skip')}
          variant={granted ? 'primary' : 'secondary'}
          onPress={next}
        />
      </View>
    </Screen>
  );
}

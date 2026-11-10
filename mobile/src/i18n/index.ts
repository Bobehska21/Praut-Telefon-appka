import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import cs from './cs.json';
import en from './en.json';

export type AppLanguage = 'cs' | 'en';

export function resolveLanguage(setting: 'system' | AppLanguage): AppLanguage {
  if (setting !== 'system') return setting;
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'cs';
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { cs: { translation: cs }, en: { translation: en } },
  lng: resolveLanguage('system'),
  fallbackLng: 'cs',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;

import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';

import { AppText, Button, Card, Heading, Screen } from '@/components/ui';
import { errorText } from '@/features/multiplayer/errors';
import { loginAccount, registerAccount } from '@/features/multiplayer/service';
import { useMultiplayerStore } from '@/features/multiplayer/store';
import { radius, spacing, useTheme } from '@/theme';

const USERNAME_RE = /^[A-Za-z0-9._-]{3,20}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

/**
 * Shown after onboarding (and after signing out) until the user has an account. Username and password
 * only, no e-mail. The username is a private login name; it is never shown to other players.
 */
export default function AuthScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const signedIn = useMultiplayerStore((s) => s.joined);
  const serverUrl = useMultiplayerStore((s) => s.serverUrl);
  const setServerUrl = useMultiplayerStore((s) => s.setServerUrl);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [server, setServer] = useState(serverUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = mode === 'register';

  if (signedIn) return <Redirect href="/" />;

  function validate(): string | null {
    if (!USERNAME_RE.test(username)) return t('auth.badUsername');
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return t('auth.badPassword');
    if (register && password !== password2) return t('auth.mismatch');
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setServerUrl(server);
      if (register) await registerAccount(username, password);
      else await loginAccount(username, password);
      // The tab layout notices the new session and leaves this screen by itself.
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  const input = [styles.input, { color: theme.text, borderColor: theme.border }];

  return (
    <Screen>
      <Heading>{register ? t('auth.registerTitle') : t('auth.title')}</Heading>
      <AppText muted>{t('auth.intro')}</AppText>

      <Card>
        <AppText weight="600">{t('auth.username')}</AppText>
        <TextInput
          value={username}
          onChangeText={setUsername}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          placeholder={t('auth.username')}
          placeholderTextColor={theme.textMuted}
          style={input}
        />
        {register && (
          <AppText muted size={12}>
            {t('auth.usernameHint')}
          </AppText>
        )}

        <AppText weight="600">{t('auth.password')}</AppText>
        <TextInput
          value={password}
          onChangeText={setPassword}
          maxLength={PASSWORD_MAX}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={register ? 'new-password' : 'current-password'}
          textContentType={register ? 'newPassword' : 'password'}
          placeholder={t('auth.password')}
          placeholderTextColor={theme.textMuted}
          style={input}
        />
        {register && (
          <>
            <TextInput
              value={password2}
              onChangeText={setPassword2}
              maxLength={PASSWORD_MAX}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder={t('auth.password2')}
              placeholderTextColor={theme.textMuted}
              style={input}
            />
            <AppText muted size={12}>
              {t('auth.passwordHint')} {t('auth.noReset')}
            </AppText>
          </>
        )}

        {error && (
          <AppText size={13} style={{ color: theme.danger }}>
            {error}
          </AppText>
        )}
        <Button
          label={busy ? t('auth.working') : register ? t('auth.register') : t('auth.login')}
          onPress={() => void submit()}
          disabled={busy}
        />
        <Button
          label={register ? t('auth.toLogin') : t('auth.toRegister')}
          variant="secondary"
          onPress={() => {
            setMode(register ? 'login' : 'register');
            setError(null);
          }}
          disabled={busy}
        />
      </Card>

      <Card>
        <AppText weight="600" size={13} muted>
          {t('auth.server').toLocaleUpperCase()}
        </AppText>
        <TextInput
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholderTextColor={theme.textMuted}
          style={input}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
});

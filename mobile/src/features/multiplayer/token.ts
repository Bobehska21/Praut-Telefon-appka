import * as SecureStore from 'expo-secure-store';

const KEY = 'focus_mp_token';

/** The bearer token for the game server. Kept in the platform secure store (Android Keystore backed), never in MMKV or logs. */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

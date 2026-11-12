import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { FocusModule } from '@/modules/focus';
import { isNicknameAllowed, safeNickname } from '@/features/nickname';
import { totalXp } from '@/features/progress/totals';
import { levelForXp, rankKey } from '@/features/progress/xp';
import { useAppStore } from '@/store';
import { ApiError, request, uploadPhoto } from './api';
import { useMultiplayerStore } from './store';
import { clearToken, saveToken } from './token';
import type {
  BlockedPlayer,
  KillResult,
  Leaderboard,
  MyProfile,
  MyStats,
  NearbyPlayer,
  ReportKind,
} from './types';

/** IANA time zone of this phone; the server uses it to find "today" for points and the 90-minute rule. */
function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Prague';
  } catch {
    return 'Europe/Prague';
  }
}

/** What others see: only a nickname that passes the rules, plus rank and level (from XP, never from minutes). */
function publicProfile() {
  const app = useAppStore.getState();
  const level = levelForXp(totalXp({ claimed: app.claimed, achievements: app.achievements }));
  return {
    nickname: safeNickname(app.settings.nickname),
    rankKey: rankKey(level),
    level,
    multiplayerEnabled: app.settings.nearbyEnabled !== false,
    timezone: timezone(),
  };
}

// ---------------------------------------------------------------------------------- account

interface AuthResponse {
  playerId: string;
  token: string;
  profile?: MyProfile;
}

/** Shared tail of register and login: keep the token, tell the native side, publish the profile. */
async function finishAuth({ playerId, token }: AuthResponse, username: string): Promise<void> {
  await saveToken(token);
  useMultiplayerStore.getState().setJoined(playerId);
  await FocusModule.setPlayerId(playerId);
  await FocusModule.setServer(useMultiplayerStore.getState().serverUrl, token);
  // The login name is private. It becomes the first public nickname only if it passes the nickname rules
  // and the user has not chosen one yet; it can be changed in Settings.
  const app = useAppStore.getState();
  if (!app.settings.nickname && isNicknameAllowed(username)) app.updateSettings({ nickname: username });
  await syncProfile().catch(() => undefined);
  await publishToken().catch(() => undefined);
}

/** Creates an account (username + password, no e-mail). The device key pair stays in the Keystore. */
export async function registerAccount(username: string, password: string): Promise<void> {
  const publicKey = await FocusModule.getDevicePublicKey();
  const response = await request<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: { username, password, publicKey, timezone: timezone() },
    anonymous: true,
  });
  await finishAuth(response, username);
}

/** Signs in. The server replaces the stored device key with this phone's key and signs other devices out. */
export async function loginAccount(username: string, password: string): Promise<void> {
  const publicKey = await FocusModule.getDevicePublicKey();
  const response = await request<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: { username, password, publicKey },
    anonymous: true,
  });
  await finishAuth(response, username);
}

async function forgetLocalSession(): Promise<void> {
  await clearToken();
  useMultiplayerStore.getState().leave();
  await FocusModule.setPlayerId('');
  await FocusModule.setServer('', '');
}

/** Signs out on this phone (the account stays on the server). */
export async function logoutAccount(): Promise<void> {
  try {
    await request('/v1/auth/logout', { method: 'POST' });
  } catch {
    // Offline or already invalid: the local session is dropped either way.
  } finally {
    await forgetLocalSession();
  }
}

/** Deletes the account and all its data on the server (GDPR erasure), then forgets it locally. */
export async function leaveMultiplayer(): Promise<void> {
  try {
    await request('/v1/me', { method: 'DELETE' });
  } finally {
    await forgetLocalSession();
  }
}

export async function syncProfile(): Promise<MyProfile> {
  return request<MyProfile>('/v1/me', { method: 'PUT', body: publicProfile() });
}

/** Registers today's rotating Bluetooth token so other phones can look this player up. */
export async function publishToken(): Promise<void> {
  const { token, day } = await FocusModule.getTodayToken();
  await request('/v1/me/ble-token', { method: 'PUT', body: { token, day } });
}

export async function fetchMe(): Promise<MyProfile> {
  const me = await request<MyProfile>('/v1/me');
  // The server is authoritative for the wasteman state; keep the phone's Bluetooth presence in line with it.
  await FocusModule.setWasteman(me.state === 'wasteman');
  return me;
}

export const fetchStats = () => request<MyStats>('/v1/me/stats');

export const fetchLeaderboard = (date?: string) =>
  request<Leaderboard>(`/v1/leaderboard${date ? `?date=${encodeURIComponent(date)}` : ''}`);

// ------------------------------------------------------------------------------ nearby, kills

/** Players seen over Bluetooth, resolved by the server (nickname, rank, photo, status). Hidden players are simply absent. */
export async function refreshNearby(): Promise<NearbyPlayer[]> {
  const seen = await FocusModule.getNearbyTokens();
  if (seen.length === 0) return [];
  return request<NearbyPlayer[]>('/v1/nearby', {
    method: 'POST',
    body: { tokens: seen.map((s) => s.token).slice(0, 50) },
  });
}

/**
 * Kill a wasteman who is within Bluetooth range. The server issues a short-lived challenge, the other
 * phone signs it over Bluetooth, and the server verifies the signature and applies all the rules.
 */
export async function killPlayer(target: NearbyPlayer): Promise<KillResult> {
  const myId = useMultiplayerStore.getState().playerId;
  if (!myId) throw new ApiError('unauthorized', 'Not joined', 401);
  const challenge = await request<{ challengeId: string; nonce: string }>('/v1/kills/challenge', {
    method: 'POST',
    body: { targetPlayerId: target.playerId },
  });
  let signature: string;
  try {
    signature = await FocusModule.requestKillProof(target.token, `${challenge.challengeId}|${challenge.nonce}|${myId}`);
  } catch (e) {
    // Lost signal or the target walked away before answering: nothing was applied, the challenge just expires.
    const code = (e as { code?: string }).code ?? 'out_of_range';
    throw new ApiError(code, 'Could not reach the player over Bluetooth', 0);
  }
  return request<KillResult>('/v1/kills', { method: 'POST', body: { challengeId: challenge.challengeId, signature } });
}

// ----------------------------------------------------------------------- blocking, reporting

export const blockPlayer = (playerId: string) => request('/v1/blocks', { method: 'POST', body: { playerId } });
export const unblockPlayer = (playerId: string) => request(`/v1/blocks/${encodeURIComponent(playerId)}`, { method: 'DELETE' });
export const listBlocked = () => request<BlockedPlayer[]>('/v1/blocks');

export const reportPlayer = (targetPlayerId: string, kind: ReportKind, note?: string) =>
  request('/v1/reports', { method: 'POST', body: { targetPlayerId, kind, note } });

// ------------------------------------------------------------------------------ profile photo

export type PhotoSource = 'gallery' | 'camera';

/**
 * Lets the user pick or take a photo, squares and shrinks it to 256 px and uploads it. Returns false if
 * the user cancelled. The server re-encodes it again, which also strips location data.
 */
export async function chooseAndUploadPhoto(source: PhotoSource): Promise<boolean> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 1 };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new ApiError('camera_denied', 'Camera permission denied', 0);
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    // The system photo picker needs no storage permission.
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || result.assets.length === 0) return false;

  const image = await ImageManipulator.manipulate(result.assets[0].uri).resize({ width: 256, height: 256 }).renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  await uploadPhoto(saved.uri);
  return true;
}

export const removePhoto = () => request('/v1/me/photo', { method: 'DELETE' });

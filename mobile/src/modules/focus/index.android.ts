import { NativeModule, requireNativeModule } from 'expo';

import type {
  BlockedAttemptRecord,
  FocusModuleApi,
  FocusStatus,
  InstalledApp,
  NearbyEncounter,
  NativeSchedule,
  PermissionMap,
  PermissionName,
  PermissionState,
} from './types';

export * from './types';

/** Shape of the Kotlin module in `modules/focus/android`. */
type FocusEvents = { onPackagesChanged: (payload: { packageName: string }) => void };

declare class NativeFocus extends NativeModule<FocusEvents> {
  getInstalledApps(): Promise<InstalledApp[]>;
  setAllowedApps(profileId: string, appIds: string[]): Promise<void>;
  setUnlockGuard(mode: 'none' | 'countdown' | 'sentence'): Promise<void>;
  setNearby(enabled: boolean, nickname: string, rank: string, level: number, streak: number): Promise<void>;
  getNearbyEncounters(): Promise<NearbyEncounter[]>;
  setSchedules(items: NativeSchedule[]): Promise<void>;
  drainBlockedAttempts(): Promise<BlockedAttemptRecord[]>;
  startFocus(profileId: string, durationMs: number | null): Promise<FocusStatus>;
  stopFocus(): Promise<FocusStatus>;
  getStatus(): Promise<FocusStatus>;
  getPermissions(): Promise<PermissionMap>;
  requestPermission(name: PermissionName): Promise<PermissionState>;
}

const native = requireNativeModule<NativeFocus>('Focus');

/** Order in which the onboarding asks, and in which `requestPermissions` walks them. */
const REQUEST_ORDER: PermissionName[] = [
  'usageAccess',
  'overlay',
  'notificationAccess',
  'notifications',
  'batteryOptimization',
  'exactAlarm',
];

export const FocusModule: FocusModuleApi = {
  platform: 'android',
  addPackagesListener: (callback) => {
    const subscription = native.addListener('onPackagesChanged', () => callback());
    return () => subscription.remove();
  },
  getInstalledApps: () => native.getInstalledApps(),
  pickAllowedApps: () =>
    Promise.reject(Object.assign(new Error('pickAllowedApps is iOS only'), { code: 'UNSUPPORTED' })),
  setAllowedApps: (profileId, appIds) => native.setAllowedApps(profileId, appIds),
  setUnlockGuard: (mode) => native.setUnlockGuard(mode),
  setNearby: (c) => native.setNearby(c.enabled, c.nickname, c.rank, c.level, c.streak),
  getNearbyEncounters: () => native.getNearbyEncounters(),
  setSchedules: (items) => native.setSchedules(items),
  drainBlockedAttempts: () => native.drainBlockedAttempts(),
  startFocus: (profileId, durationMs) => native.startFocus(profileId, durationMs),
  stopFocus: () => native.stopFocus(),
  getStatus: () => native.getStatus(),
  getPermissions: () => native.getPermissions(),
  requestPermission: (name) => native.requestPermission(name),
  /** Opens the first missing system screen; the UI re-reads permissions when the app is resumed. */
  async requestPermissions() {
    const current = await native.getPermissions();
    const missing = REQUEST_ORDER.find((name) => current[name] !== 'granted');
    if (missing) await native.requestPermission(missing);
    return native.getPermissions();
  },
};

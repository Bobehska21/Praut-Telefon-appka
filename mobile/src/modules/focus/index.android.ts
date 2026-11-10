import { requireNativeModule } from 'expo';

import type {
  BlockedAttemptRecord,
  FocusModuleApi,
  FocusStatus,
  InstalledApp,
  NativeSchedule,
  PermissionMap,
  PermissionName,
  PermissionState,
} from './types';

export * from './types';

/** Shape of the Kotlin module in `modules/focus/android`. */
interface NativeFocus {
  getInstalledApps(): Promise<InstalledApp[]>;
  setAllowedApps(profileId: string, appIds: string[]): Promise<void>;
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
  'notifications',
  'batteryOptimization',
  'defaultLauncher',
  'exactAlarm',
];

export const FocusModule: FocusModuleApi = {
  platform: 'android',
  getInstalledApps: () => native.getInstalledApps(),
  pickAllowedApps: () =>
    Promise.reject(Object.assign(new Error('pickAllowedApps is iOS only'), { code: 'UNSUPPORTED' })),
  setAllowedApps: (profileId, appIds) => native.setAllowedApps(profileId, appIds),
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

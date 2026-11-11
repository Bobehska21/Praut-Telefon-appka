import { requireNativeModule } from 'expo';

import type {
  BlockedAttemptRecord,
  FocusModuleApi,
  FocusStatus,
  NativeSchedule,
  PermissionMap,
  PermissionName,
  PermissionState,
  PickResult,
} from './types';

export * from './types';

/** Shape of the Swift module in `modules/focus/ios`. */
interface NativeFocus {
  pickAllowedApps(profileId: string): Promise<PickResult | null>;
  setAllowedApps(profileId: string, appIds: string[]): Promise<void>;
  setUnlockGuard(mode: 'none' | 'countdown' | 'sentence'): Promise<void>;
  setSchedules(items: NativeSchedule[]): Promise<void>;
  drainBlockedAttempts(): Promise<BlockedAttemptRecord[]>;
  startFocus(profileId: string, durationMs: number | null): Promise<FocusStatus>;
  stopFocus(): Promise<FocusStatus>;
  getStatus(): Promise<FocusStatus>;
  getPermissions(): Promise<PermissionMap>;
  requestPermission(name: PermissionName): Promise<PermissionState>;
}

const native = requireNativeModule<NativeFocus>('Focus');

export const FocusModule: FocusModuleApi = {
  platform: 'ios',
  addPackagesListener: () => () => {},
  // Apple does not expose installed apps; selection happens in the system picker.
  getInstalledApps: () =>
    Promise.reject(Object.assign(new Error('getInstalledApps is Android only'), { code: 'UNSUPPORTED' })),
  pickAllowedApps: (profileId) => native.pickAllowedApps(profileId),
  setAllowedApps: (profileId, appIds) => native.setAllowedApps(profileId, appIds),
  setUnlockGuard: (mode) => native.setUnlockGuard(mode),
  setSchedules: (items) => native.setSchedules(items),
  drainBlockedAttempts: () => native.drainBlockedAttempts(),
  startFocus: (profileId, durationMs) => native.startFocus(profileId, durationMs),
  stopFocus: () => native.stopFocus(),
  getStatus: () => native.getStatus(),
  getPermissions: () => native.getPermissions(),
  requestPermission: (name) => native.requestPermission(name),
  async requestPermissions() {
    await native.requestPermission('screenTime');
    return native.getPermissions();
  },
};

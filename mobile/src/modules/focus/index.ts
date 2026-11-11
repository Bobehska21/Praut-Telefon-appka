import { EMPTY_STATUS, type FocusModuleApi, type FocusStatus, type PermissionMap } from './types';

export * from './types';

/**
 * Fallback implementation used on web, in tests and until the native modules are
 * linked. Metro picks `index.android.ts` / `index.ios.ts` on device instead.
 * State is held in memory only.
 */
let status: FocusStatus = { ...EMPTY_STATUS };

const allGranted: PermissionMap = {
  usageAccess: 'granted',
  overlay: 'granted',
  notifications: 'granted',
  screenTime: 'granted',
};

export const FocusModule: FocusModuleApi = {
  platform: 'unsupported',
  addPackagesListener: () => () => {},
  async getInstalledApps() {
    return [
      { id: 'mock.notes', label: 'Notes' },
      { id: 'mock.mail', label: 'Mail' },
      { id: 'mock.browser', label: 'Browser' },
    ];
  },
  async pickAllowedApps() {
    return { selectionId: 'mock-selection', appCount: 0 };
  },
  async setAllowedApps() {},
  async setUnlockGuard() {},
  async setSchedules() {},
  async drainBlockedAttempts() {
    return [];
  },
  async startFocus(profileId, durationMs) {
    const now = Date.now();
    status = {
      active: true,
      profileId,
      startedAt: now,
      endsAt: durationMs === null ? null : now + durationMs,
      blockedAttempts: 0,
    };
    return status;
  },
  async stopFocus() {
    status = { ...EMPTY_STATUS };
    return status;
  },
  async getStatus() {
    return status;
  },
  async getPermissions() {
    return allGranted;
  },
  async requestPermission(name) {
    return allGranted[name] ?? 'unknown';
  },
  async requestPermissions() {
    return allGranted;
  },
};

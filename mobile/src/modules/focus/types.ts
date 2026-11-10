/**
 * Cross-platform contract for the native focus module.
 *
 * Android: `id` is the package name, label/icon are available.
 * iOS: apps are opaque Screen Time tokens. They are only produced by the system
 * picker, so `label` and `iconUri` are never available there.
 */

export type Platform = 'android' | 'ios' | 'unsupported';

export interface InstalledApp {
  /** Package name (Android). */
  id: string;
  label: string;
  /** `data:image/png;base64,...` or file URI. */
  iconUri?: string;
}

export type PermissionName =
  | 'usageAccess' // Android: PACKAGE_USAGE_STATS
  | 'overlay' // Android: SYSTEM_ALERT_WINDOW
  | 'notifications' // Android 13+: POST_NOTIFICATIONS
  | 'batteryOptimization' // Android: ignore battery optimizations
  | 'defaultLauncher' // Android: act as HOME app
  | 'accessibility' // Android: optional AccessibilityService
  | 'exactAlarm' // Android 12+: SCHEDULE_EXACT_ALARM, needed to start schedules on time
  | 'screenTime'; // iOS: FamilyControls authorization

export type PermissionState = 'granted' | 'denied' | 'unknown';

export type PermissionMap = Partial<Record<PermissionName, PermissionState>>;

export interface FocusStatus {
  active: boolean;
  profileId: string | null;
  /** Epoch ms. */
  startedAt: number | null;
  /** Epoch ms, `null` = until stopped manually. */
  endsAt: number | null;
  /** Blocked attempts since the session started (native-side counter). */
  blockedAttempts: number;
}

export interface PickResult {
  /** Opaque ids to persist per profile (iOS: serialized token selection). */
  selectionId: string;
  /** Number of apps/categories chosen, for display only. */
  appCount: number;
}

export interface NativeSchedule {
  profileId: string;
  days: number[];
  startMinute: number;
  endMinute: number;
}

export interface BlockedAttemptRecord {
  at: number;
  appId?: string;
}

export interface FocusModuleApi {
  readonly platform: Platform;
  /** Android only. iOS rejects with `UNSUPPORTED`. */
  getInstalledApps(): Promise<InstalledApp[]>;
  /** iOS only. Opens FamilyActivityPicker. Android rejects with `UNSUPPORTED`. */
  pickAllowedApps(profileId: string): Promise<PickResult | null>;
  /** Android: pushes the whitelist to native before starting. */
  setAllowedApps(profileId: string, appIds: string[]): Promise<void>;
  /** Native side runs the schedule (Android: alarms/service, iOS: DeviceActivityMonitor). */
  setSchedules(items: NativeSchedule[]): Promise<void>;
  /** Returns attempts recorded natively since the last call and clears them. */
  drainBlockedAttempts(): Promise<BlockedAttemptRecord[]>;
  startFocus(profileId: string, durationMs: number | null): Promise<FocusStatus>;
  stopFocus(): Promise<FocusStatus>;
  getStatus(): Promise<FocusStatus>;
  getPermissions(): Promise<PermissionMap>;
  /** Triggers the system flow for one permission, returns the new state. */
  requestPermission(name: PermissionName): Promise<PermissionState>;
  requestPermissions(): Promise<PermissionMap>;
}

export const EMPTY_STATUS: FocusStatus = {
  active: false,
  profileId: null,
  startedAt: null,
  endsAt: null,
  blockedAttempts: 0,
};

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
  | 'notificationAccess' // Android: NotificationListenerService, hides notifications of apps that are not allowed
  | 'bluetooth' // Android: BLE scan/advertise/connect, for the nearby-users feature
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
  /** Focus was switched off by hand and not yet restarted (multiplayer only). */
  wasteman?: boolean;
}

export interface PickResult {
  /** Opaque ids to persist per profile (iOS: serialized token selection). */
  selectionId: string;
  /** Number of apps/categories chosen, for display only. */
  appCount: number;
}

export interface NearbyConfig {
  /** User switch for the feature. It also needs the Bluetooth permission and focus mode to be on. */
  enabled: boolean;
  /** Optional, at most 20 characters; shown to people who accept the notification about you. */
  nickname: string;
  rank: string;
  level: number;
  streak: number;
}

/** Someone the user accepted when they were nearby, with what they chose to share. */
export interface NearbyEncounter {
  at: number;
  nickname: string;
  rank: string;
  level: number;
  streak: number;
}

/** A phone seen over Bluetooth recently. The token is a daily rotating pseudonym; the server says who it is. */
export interface NearbyToken {
  /** 6 bytes as hex. */
  token: string;
  /** What the other phone advertises. A hint only: the server decides who is really a wasteman. */
  status: 'focus' | 'wasteman';
  rssi: number;
  /** Epoch ms of the last sighting. */
  seenAt: number;
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
  /** Calls `callback` when an app is installed, removed or updated. Returns an unsubscribe function. */
  addPackagesListener(callback: () => void): () => void;
  /** Android only. iOS rejects with `UNSUPPORTED`. */
  getInstalledApps(): Promise<InstalledApp[]>;
  /** iOS only. Opens FamilyActivityPicker. Android rejects with `UNSUPPORTED`. */
  pickAllowedApps(profileId: string): Promise<PickResult | null>;
  /** Android: pushes the whitelist to native before starting. */
  setAllowedApps(profileId: string, appIds: string[]): Promise<void>;
  /** Mirrors the stop-protection setting so the native launcher can enforce it without JS. */
  setUnlockGuard(mode: 'none' | 'countdown' | 'sentence'): Promise<void>;
  /** Android only. Tells the native layer what to share and whether to look for others. */
  setNearby(config: NearbyConfig): Promise<void>;
  getNearbyEncounters(): Promise<NearbyEncounter[]>;
  // --- multiplayer (Android first; iOS rejects with UNSUPPORTED until it is implemented) ---
  /** Public half of this device's signing key (base64 SPKI); registered with the server. */
  getDevicePublicKey(): Promise<string>;
  /** The server-issued player id, needed to sign proximity proofs. Empty string clears it. */
  setPlayerId(playerId: string): Promise<void>;
  /** Mirrors the server's wasteman state so the phone stays visible over Bluetooth. */
  setWasteman(wasteman: boolean): Promise<void>;
  /** Game server address and bearer token for the background sync (heartbeats, events). Empty strings clear them. */
  setServer(url: string, token: string): Promise<void>;
  /** Today's rotating Bluetooth token, to register with the server. */
  getTodayToken(): Promise<{ token: string; day: string }>;
  /** Phones seen over Bluetooth in the last few minutes. */
  getNearbyTokens(): Promise<NearbyToken[]>;
  /** Exchanges the server's challenge (`challengeId|nonce|killerPlayerId`) with the phone behind `token`; returns its signature. */
  requestKillProof(token: string, payload: string): Promise<string>;
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

export interface Profile {
  id: string;
  name: string;
  /** Android: package names. */
  allowedAppIds: string[];
  /** iOS: id of the stored FamilyActivitySelection (opaque). */
  selectionId: string | null;
  /** iOS: number of apps/categories in the selection, display only. */
  selectionCount: number;
}

export interface Schedule {
  id: string;
  profileId: string;
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** Minutes since midnight, local time. */
  startMinute: number;
  /** Minutes since midnight. If less than start, the range wraps past midnight. */
  endMinute: number;
  enabled: boolean;
}

export interface SessionRecord {
  id: string;
  profileId: string;
  startedAt: number;
  endedAt: number;
  /** Planned length, `null` for "until I stop it". Missing on records saved before rewards existed. */
  plannedMs?: number | null;
  /** True if a timed session ran to its end instead of being stopped early. */
  completed?: boolean;
}

/** Something to celebrate: shown one at a time in a modal. */
export interface RewardEvent {
  id: string;
  kind: 'session' | 'quest' | 'achievement' | 'level';
  xp: number;
  /** i18n key suffix and params for the title (quest key, achievement id). */
  ref?: string;
  params?: Record<string, string | number>;
  level?: number;
}

export interface BlockedAttempt {
  at: number;
  /** Android only. */
  appId?: string;
}

export type UnlockGuard = 'none' | 'countdown' | 'sentence';

export interface Settings {
  unlockGuard: UnlockGuard;
  /** Android: opt-in AccessibilityService variant. */
  accessibilityMode: boolean;
  onboardingDone: boolean;
  language: 'system' | 'cs' | 'en';
  /** Shown to nearby users who accept the notification about you. Optional. */
  nickname: string;
  /** Take part in nearby detection (still needs the Bluetooth permission). */
  nearbyEnabled: boolean;
}

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
}

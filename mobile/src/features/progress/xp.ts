import type { SessionRecord } from '@/store/types';

/** Up to this many minutes of one session earn XP, so a phone left on overnight is not a free level. */
export const MAX_SESSION_XP_MINUTES = 120;
export const COMPLETION_BONUS = 10;
/** The completion bonus only applies to sessions that were meant to last at least this long. */
export const MIN_BONUS_PLANNED_MS = 15 * 60_000;

export function sessionMinutes(s: Pick<SessionRecord, 'startedAt' | 'endedAt'>): number {
  return Math.max(0, (s.endedAt - s.startedAt) / 60_000);
}

/** 1 XP per focused minute, plus a bonus for finishing a planned session. */
export function sessionXp(s: SessionRecord): number {
  const minutes = Math.min(MAX_SESSION_XP_MINUTES, Math.floor(sessionMinutes(s)));
  const bonus = s.completed === true && (s.plannedMs ?? 0) >= MIN_BONUS_PLANNED_MS ? COMPLETION_BONUS : 0;
  return minutes + bonus;
}

/** Total XP needed to reach `level` (level 1 starts at 0): 0, 100, 300, 600, 1000 ... */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  needed: number;
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const needed = xpForLevel(level + 1) - base;
  return { level, into: xp - base, needed, fraction: (xp - base) / needed };
}

export type RankKey = 'novice' | 'apprentice' | 'adept' | 'warden' | 'master' | 'grandmaster';

export function rankKey(level: number): RankKey {
  if (level < 3) return 'novice';
  if (level < 5) return 'apprentice';
  if (level < 7) return 'adept';
  if (level < 10) return 'warden';
  if (level < 15) return 'master';
  return 'grandmaster';
}
